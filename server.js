
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

const MessageSchema = new mongoose.Schema({
  user: String,
  userContact: String,
  friendContact: String,
  message: String,
  delivered: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
}, { timestamps: true });

const ProfileSchema = new mongoose.Schema({
  contact: { type: String, unique: true },
  name: String,
  profilePicture: String,
  status: String,
  bio: String,
  pin: String,
});

const ContactSchema = new mongoose.Schema({
  userContact: String,
  contact: String,
  name: String,
  profilePicture: String,
  status: String,
  bio: String,
});

const Message = mongoose.model('Message', MessageSchema);
const Profile = mongoose.model('Profile', ProfileSchema);
const Contact = mongoose.model('Contact', ContactSchema);

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('register', (contact) => {
    socket.join(contact);
  });

  socket.on('sendMessage', async (data) => {
    try {
      const message = new Message(data);
      await message.save();
      io.to(data.friendContact).emit('receiveMessage', message);
      io.to(data.userContact).emit('messageDelivered', message._id);
    } catch (error) {
      console.error('Error saving message:', error.message);
      socket.emit('error', 'Message could not be saved');
    }
  });

  socket.on('messageRead', async (messageId) => {
    try {
      await Message.findByIdAndUpdate(messageId, { read: true });
      const message = await Message.findById(messageId);
      io.to(message.userContact).emit('messageRead', messageId);
    } catch (error) {
      console.error('Error updating message read status:', error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

app.post('/setProfile', async (req, res) => {
  try {
    const profile = new Profile(req.body);
    await profile.save();
    res.status(201).json(profile);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/verifyPin', async (req, res) => {
  try {
    const { contact, pin } = req.body;
    const profile = await Profile.findOne({ contact });
    if (profile && profile.pin === pin) {
      res.status(200).json({ success: true });
    } else {
      res.status(200).json({ success: false });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/contacts', async (req, res) => {
  try {
    const { userContact, search } = req.query;
    const contacts = await Contact.find({
      userContact,
      $or: [
        { contact: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ],
    });
    res.status(200).json(contacts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/addContact', async (req, res) => {
  try {
    const contact = new Contact(req.body);
    await contact.save();
    res.status(201).json(contact);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/editContact/:id', async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(contact);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/deleteContact/:id', async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
