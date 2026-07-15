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
let virtualOccupied = true;
let masterPowerActive = true; 

// Relay tracking states
let relay1State = "OFF";
let relay2State = "OFF";

try {
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
    console.log("⚠️ No Arduino detected. Switching to Simulation Mode.");
    startSimulation();
}

function startSimulation() {
    isSimulating = true;
    console.log("✨ Simulation Mode Active. Generating virtual SEMS data...");
    
    setInterval(() => {
        if (!masterPowerActive) return;
        
        virtualOccupied = !virtualOccupied;
        if (virtualOccupied) {
            io.emit('arduino-data', "Room Occupied");
            io.emit('arduino-data', "[SIM] Occupant entered room.");
        } else {
            io.emit('arduino-data', "Room Vacant");
            io.emit('arduino-data', "[SIM] Room empty timeout reached.");
        }
    }, 30000);

    // Simulate current draw fluctuations
    setInterval(() => {
        if (!masterPowerActive) {
            io.emit('arduino-data', "AMPS:0.000");
            return;
        }

        if (virtualOccupied) {
            let baseDraw = 0.05;
            if (relay1State === "ON") baseDraw += 0.45;
            if (relay2State === "ON") baseDraw += 1.15;
            
            const simulatedAmps = (baseDraw + Math.random() * 0.1).toFixed(3);
            io.emit('arduino-data', `AMPS:${simulatedAmps}`);
        } else {
            io.emit('arduino-data', "AMPS:0.000");
        }
    }, 2000);
}

io.on('connection', (socket) => {
    console.log('🔌 Web browser connected.');

    // Device state feedback simulation helper
    socket.on('relay-control', (zone) => {
        console.log(`[Web Override Command]: Toggle ${zone}`);

        if (zone === 'all-off') {
            masterPowerActive = false;
            relay1State = "OFF";
            relay2State = "OFF";
            io.emit('arduino-data', "[EMERGENCY] Global power cut initiated.");
            io.emit('arduino-data', "GLOBAL_CUT:ON"); 
            io.emit('arduino-data', "Room Vacant");
            io.emit('arduino-data', "AMPS:0.000");
        } else if (zone === 'restore-power') {
            masterPowerActive = true;
            io.emit('arduino-data', "[SYSTEM] Global grid power restored.");
        } else if (zone === 'lights' && masterPowerActive) {
            relay1State = (relay1State === "ON") ? "OFF" : "ON";
            io.emit('arduino-data', `[SYNC] Zone 1 ${relay1State}`);
        } else if (zone === 'ac' && masterPowerActive) {
            relay2State = (relay2State === "ON") ? "OFF" : "ON";
            io.emit('arduino-data', `[SYNC] Zone 2 ${relay2State}`);
        }

        if (!isSimulating && arduinoPort && arduinoPort.writable) {
            let command = '';
            if (zone === 'lights') command = 'L';
            else if (zone === 'ac') command = 'A';
            else if (zone === 'all-off') command = 'Q'; 
            else if (zone === 'restore-power') command = 'R'; 
            
            arduinoPort.write(command);
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 SEMS Web Dashboard running at http://localhost:${PORT}`);
});