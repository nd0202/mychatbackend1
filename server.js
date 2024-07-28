
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.log('MongoDB connection error:', err);
    process.exit(1);
  });

// Schemas and Models
const userSchema = new mongoose.Schema({
  contact: String,
  name: String,
  profilePicture: String,
  status: String,
  bio: String,
  pin: String
});

const contactSchema = new mongoose.Schema({
  userContact: String,
  contact: String,
  name: String,
  profilePicture: String,
  status: String,
  bio: String
});

const messageSchema = new mongoose.Schema({
  user: String,
  userContact: String,
  friendContact: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
  delivered: { type: Boolean, default: false },
  read: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const Contact = mongoose.model('Contact', contactSchema);
const Message = mongoose.model('Message', messageSchema);

let users = {}; // This will store users and their socket ids

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('register', async (contact) => {
    users[contact] = socket.id;
    console.log(`User registered with contact: ${contact}`);
    console.log('Current users:', users);

    // Fetch user profile
    const user = await User.findOne({ contact });
    if (user) {
      socket.emit('userProfile', user);
    }
  });

  socket.on('sendMessage', async (messageData) => {
    const { user, userContact, friendContact, message } = messageData;
    const newMessage = new Message(messageData);

    console.log('Saving message:', newMessage);

    try {
      await newMessage.save();
      console.log('Message saved:', newMessage);
      const receiverSocketId = users[friendContact];

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receiveMessage', newMessage);
        newMessage.delivered = true;
        await newMessage.save();
        console.log('Message sent to:', receiverSocketId);
      } else {
        console.log('Receiver not connected:', friendContact);
      }

      io.to(socket.id).emit('messageDelivered', newMessage._id);
    } catch (err) {
      console.log('Error saving message:', err);
    }
  });

  socket.on('messageRead', async (messageId) => {
    try {
      const message = await Message.findById(messageId);
      if (message) {
        message.read = true;
        await message.save();
        io.to(users[message.userContact]).emit('messageRead', messageId);
      }
    } catch (err) {
      console.log('Error marking message as read:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    for (let contact in users) {
      if (users[contact] === socket.id) {
        delete users[contact];
        console.log(`User with contact ${contact} disconnected`);
        break;
      }
    }
    console.log('Current users:', users);
  });
});

app.post('/setProfile', async (req, res) => {
  const { contact, name, profilePicture, status, bio, pin } = req.body;
  try {
    let user = await User.findOne({ contact });
    if (user) {
      user.name = name;
      user.profilePicture = profilePicture;
      user.status = status;
      user.bio = bio;
      user.pin = pin;
    } else {
      user = new User({ contact, name, profilePicture, status, bio, pin });
    }
    await user.save();
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error setting profile' });
  }
});

app.post('/verifyPin', async (req, res) => {
  const { contact, pin } = req.body;
  try {
    const user = await User.findOne({ contact });
    if (user && user.pin === pin) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error verifying pin' });
  }
});

app.post('/addContact', async (req, res) => {
  const { userContact, contact, name, profilePicture, status, bio } = req.body;
  try {
    let existingContact = await Contact.findOne({ userContact, contact });
    if (!existingContact) {
      const newContact = new Contact({ userContact, contact, name, profilePicture, status, bio });
      await newContact.save();
      res.status(200).json(newContact);
    } else {
      res.status(400).json({ error: 'Contact already exists' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error adding contact' });
  }
});

app.put('/editContact/:id', async (req, res) => {
  const { id } = req.params;
  const { name, profilePicture, status, bio } = req.body;
  try {
    const contact = await Contact.findById(id);
    if (contact) {
      contact.name = name;
      contact.profilePicture = profilePicture;
      contact.status = status;
      contact.bio = bio;
      await contact.save();
      res.status(200).json(contact);
    } else {
      res.status(404).json({ error: 'Contact not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error editing contact' });
  }
});

app.delete('/deleteContact/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const contact = await Contact.findById(id);
    if (contact) {
      await contact.remove();
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: 'Contact not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error deleting contact' });
  }
});

app.get('/contacts', async (req, res) => {
  const { userContact, search } = req.query;
  try {
    let query = { userContact };
    if (search) {
      query = {
        ...query,
        $or: [
          { name: new RegExp(search, 'i') },
          { contact: new RegExp(search, 'i') }
        ]
      };
    }
    const contacts = await Contact.find(query);
    res.status(200).json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching contacts' });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
