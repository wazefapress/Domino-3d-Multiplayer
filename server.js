const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// استضافة ملفات الواجهة الأمامية من نفس المجلد الرئيسي
app.use(express.static(__dirname));

// التأكد من توجيه المسار الرئيسي إلى ملف index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('لاعب متصل:', socket.id);

    socket.on('createRoom', (roomCode) => {
        socket.join(roomCode);
        console.log(`غرفة تم إنشاؤها: ${roomCode}`);
    });

    socket.on('joinRoom', (roomCode) => {
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (room && room.size === 1) {
            socket.join(roomCode);
            io.to(roomCode).emit('gameReady');
        } else {
            socket.emit('roomError', 'الغرفة ممتلئة أو غير موجودة');
        }
    });

    socket.on('sendMessage', (data) => {
        socket.to(data.room).emit('receiveMessage', { message: data.message });
    });

    socket.on('playPiece', (data) => {
        socket.to(data.room).emit('piecePlayed', data);
    });

    socket.on('playerPassed', (data) => {
        socket.to(data.room).emit('opponentPassed');
    });

    socket.on('disconnect', () => {
        console.log('لاعب غادر:', socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل بنجاح على المنفذ ${PORT}`);
});