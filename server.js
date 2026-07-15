const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (HTML/CSS) from the current folder
app.use(express.static(__dirname));

// --- ARDUINO SERIAL CONNECTION ---
// Change 'COM3' to whatever port your Arduino uses (e.g., '/dev/ttyUSB0' on Mac/Linux)
const arduinoPort = new SerialPort({ path: 'COM3', baudRate: 9600 });
const parser = arduinoPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// Listen for incoming serial data from Arduino
parser.on('data', (data) => {
    console.log(`[Arduino]: ${data}`);
    
    // Broadcast the raw data directly to the web dashboard
    io.emit('arduino-data', data);
});

// Start the Web Server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 SEMS Dashboard running at http://localhost:${PORT}`);
});