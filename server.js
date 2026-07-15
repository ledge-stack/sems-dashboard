const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let arduinoPort = null;
let parser = null;
let isSimulating = false;

// --- CONNECT TO ARDUINO ---
try {
    // Change 'COM3' to your actual port when hardware is connected
    arduinoPort = new SerialPort({ path: 'COM3', baudRate: 9600 });
    parser = arduinoPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    
    parser.on('data', (data) => {
        console.log(`[Arduino]: ${data}`);
        io.emit('arduino-data', data);
    });

    arduinoPort.on('error', (err) => {
        console.log("⚠️ Arduino connection error. Switching to Simulation Mode.");
        startSimulation();
    });

} catch (error) {
    console.log("⚠️ No Arduino detected on this port. Switching to Simulation Mode.");
    startSimulation();
}

// --- SIMULATION MODE (For Offline Development) ---
function startSimulation() {
    isSimulating = true;
    console.log("✨ Simulation Mode Active. Generating virtual SEMS data...");
    
    // Simulate room being occupied/vacated every 30 seconds
    let virtualOccupied = true;
    
    setInterval(() => {
        virtualOccupied = !virtualOccupied;
        if (virtualOccupied) {
            io.emit('arduino-data', "Room Occupied");
            io.emit('arduino-data', "[SIM] Occupant entered room.");
        } else {
            io.emit('arduino-data', "Room Vacant");
            io.emit('arduino-data', "[SIM] Room empty timeout reached.");
        }
    }, 30000);

    // Simulate real-time current draw fluctuations (AMPS:X.XX) every 2 seconds
    setInterval(() => {
        if (virtualOccupied) {
            // Generate a random load between 0.2A and 1.8A
            const simulatedAmps = (Math.random() * 1.6 + 0.2).toFixed(3);
            io.emit('arduino-data', `AMPS:${simulatedAmps}`);
        } else {
            io.emit('arduino-data', "AMPS:0.000");
        }
    }, 2000);
}

// --- FRONTEND TO BACKEND CONTROLS ---
io.on('connection', (socket) => {
    console.log('🔌 Web browser connected to backend.');

    // Listen for manual relay toggles from the webpage
    socket.on('relay-control', (zone) => {
        console.log(`[Web Override Command]: Toggle ${zone}`);

        if (!isSimulating && arduinoPort && arduinoPort.writable) {
            // Send a character key to Arduino over Serial
            // 'L' for Lights toggle, 'A' for AC toggle
            const command = (zone === 'lights') ? 'L' : 'A';
            arduinoPort.write(command);
        } else {
            // Simulate the physical hardware feedback locally
            io.emit('arduino-data', `[SIM OVERRIDE] Power toggled on Zone: ${zone.toUpperCase()}`);
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 SEMS Web Dashboard running at http://localhost:${PORT}`);
});