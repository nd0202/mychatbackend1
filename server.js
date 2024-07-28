
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
  .catch((err) => console.log('MongoDB connection error:', err));

// Define a simple message schema for MongoDB
const messageSchema = new mongoose.Schema({
  user: String,
  userContact: String,
  friendContact: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

let users = {}; // This will store users and their socket ids

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('register', (contact) => {
    users[contact] = socket.id;
    console.log(`User registered with contact: ${contact}`);
    console.log('Current users:', users);
  });

  socket.on('sendMessage', async (messageData) => {
    const { user, userContact, friendContact, message } = messageData;
    const newMessage = new Message(messageData);

    try {
      await newMessage.save();
      const receiverSocketId = users[friendContact];

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receiveMessage', messageData);
        console.log('Message sent to:', receiverSocketId);
      } else {
        console.log('Receiver not connected:', friendContact);
      }
    } catch (err) {
      console.log('Error saving message:', err);
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

app.get('/', (req, res) => {
  res.send('Socket.io server is running.');
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
