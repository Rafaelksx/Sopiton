import { io } from 'socket.io-client';

class SocketService {
    socket = null;

    connect(url) {
        if (this.socket) {
            this.socket.disconnect();
        }
        // Construye la URL asumiendo el puerto 3000 local por ahora
        const serverUrl = url.includes('http') ? url : `http://${url}:3000`;
        this.socket = io(serverUrl);
        return this.socket;
    }

    getSocket() {
        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

export default new SocketService();