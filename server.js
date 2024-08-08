
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const messageSchema = new mongoose.Schema({
  user: String,
  userContact: String,
  friendContact: String,
  message: String,
  reactions: [{ emoji: String }],
  seen: { type: Boolean, default: false },
});

const Message = mongoose.model('Message', messageSchema);

const userSchema = new mongoose.Schema({
  contactNumber: String,
  name: String,
});

const User = mongoose.model('User', userSchema);

let users = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('register', async (userContact) => {
    try {
      let user = await User.findOne({ contactNumber: userContact });
      if (!user) {
        user = new User({ contactNumber: userContact });
        await user.save();
      }
      users[userContact] = { socketId: socket.id, lastSeen: new Date() };
      io.emit('onlineStatus', { userContact, isOnline: true, lastSeen: null });
    } catch (error) {
      console.error('Error registering user:', error);
    }
  });

  socket.on('sendMessage', async (data) => {
    try {
      const newMessage = new Message(data);
      await newMessage.save();
      io.emit('receiveMessage', newMessage);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('addReaction', async ({ messageId, emoji }) => {
    try {
      const message = await Message.findById(messageId);
      if (message) {
        message.reactions.push({ emoji });
        await message.save();
        io.emit('receiveMessage', message); // Optionally, send an update to all clients
      }
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  });

  socket.on('deleteMessage', async (messageId) => {
    try {
      await Message.findByIdAndDelete(messageId);
      io.emit('deleteMessage', messageId); // Optionally, send an update to all clients
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  });

  socket.on('typing', ({ userContact, friendContact, isTyping }) => {
    const friendSocket = users[friendContact]?.socketId;
    if (friendSocket) {
      io.to(friendSocket).emit('typing', { userContact, isTyping });
    }
  });

  socket.on('getOnlineStatus', ({ userContact }) => {
    const user = users[userContact];
    if (user) {
      io.to(socket.id).emit('onlineStatus', {
        userContact,
        isOnline: true,
        lastSeen: user.lastSeen,
      });
    }
  });

  socket.on('messageSeen', ({ messageId, friendContact }) => {
    Message.findById(messageId).then((message) => {
      if (message && message.friendContact === friendContact) {
        message.seen = true;
        message.save();
        io.emit('receiveMessage', message);
      }
    });
  });

  socket.on('disconnect', () => {
    for (const [contact, user] of Object.entries(users)) {
      if (user.socketId === socket.id) {
        users[contact].lastSeen = new Date();
        io.emit('onlineStatus', { userContact: contact, isOnline: false, lastSeen: users[contact].lastSeen });
        delete users[contact];
        break;
      }
    }
    console.log('A user disconnected');
  });
});

server.listen(4000, () => {
  console.log('Server is running on port 4000');
});
