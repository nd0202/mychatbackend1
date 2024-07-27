
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error(err);
});

const MessageSchema = new mongoose.Schema({
  user: String,
  userContact: String,
  friendContact: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

const users = {};

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('register', (contact) => {
    users[contact] = socket.id;
    console.log(`User registered: ${contact} with socket id: ${socket.id}`);
  });

  socket.on('sendMessage', async (data) => {
    console.log('Message received:', data);
    const newMessage = new Message(data);
    await newMessage.save();

    const recipientSocketId = users[data.friendContact];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receiveMessage', data);
      console.log('Message sent to recipient:', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    for (const contact in users) {
      if (users[contact] === socket.id) {
        delete users[contact];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
