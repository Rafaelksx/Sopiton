import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import socketService from '../socket';
import './css/Home.css'; // Crearemos estilos simples para que se vea como el original

export default function Home() {
    const navigate = useNavigate();
   // const [ipAddress, setIpAddress] = useState('127.0.0.1'); // Por defecto localhost para pruebas
    const [ipAddress, setIpAddress] = useState('https://sopiton.onrender.com');
    const [nickname, setNickname] = useState('');
    const [pinToJoin, setPinToJoin] = useState('');
    const [easyMode, setEasyMode] = useState(false); // Estado para el modo fácil

    const handleConnect = () => {
        if (!nickname.trim() || !ipAddress.trim()) {
            alert("Debes ingresar tu Apodo y la IP completa del Servidor.");
            return null;
        }
        return socketService.connect(ipAddress);
    };

    const createRoom = () => {
        const socket = handleConnect();
        if (!socket) return;

        // Enviamos el easy_mode al backend Python
        socket.emit('createRoom', { nickname, easy_mode: easyMode });

        socket.once('roomCreated', ({ pin }) => {
            navigate('/lobby', { state: { pin, nickname, isHost: true } });
        });
    };

    const joinRoom = () => {
        if (!pinToJoin.trim()) {
            alert("Debes ingresar el PIN de la sala.");
            return;
        }
        const socket = handleConnect();
        if (!socket) return;

        // PRIMERO: Preparamos las orejas para escuchar la respuesta
        socket.once('errorMsg', (msg) => {
            alert(msg);
            socketService.disconnect();
        });

        socket.once('gameStarted', (gameData) => {
            console.log("¡El invitado recibió gameStarted!", gameData);
            navigate('/game', { state: { gameData, pin: pinToJoin.toUpperCase(), nickname } });
        });

        // SEGUNDO: Emitimos el evento de unirnos a la sala
        socket.emit('joinRoom', { pin: pinToJoin.toUpperCase(), nickname });
    };

    return (
        <div className="container">
            <div className="card">
                <h1 className="title">Sopa de Letras</h1>
                <p className="subtitle">Multijugador Web</p>

                <div className="input-group">
                    <label>IP del Servidor:</label>
                    <input 
                        type="text" 
                        placeholder="https://sopiton.onrender.com/" 
                        value={ipAddress} 
                        onChange={(e) => setIpAddress(e.target.value)} 
                    />
                </div>

                <div className="input-group">
                    <label>Tu Apodo:</label>
                    <input 
                        type="text" 
                        placeholder="Jugador1" 
                        maxLength="10" 
                        value={nickname} 
                        onChange={(e) => setNickname(e.target.value)} 
                    />
                </div>

                {/* Switch de Modo Fácil */}
                <div className="checkbox-group">
                    <input 
                        type="checkbox" 
                        id="easyMode" 
                        checked={easyMode} 
                        onChange={(e) => setEasyMode(e.target.checked)} 
                    />
                    <label htmlFor="easyMode">Activar Modo Fácil (Sin letras extra)</label>
                </div>

                <button className="btn-create" onClick={createRoom}>CREAR SALA NUEVA</button>

                <div className="separator">
                    <hr /><span>o únete a una</span><hr />
                </div>

                <div className="row">
                    <input 
                        className="input-half" 
                        type="text" 
                        placeholder="PIN" 
                        maxLength="6" 
                        value={pinToJoin} 
                        onChange={(e) => setPinToJoin(e.target.value.toUpperCase())} 
                    />
                    <button className="btn-join" onClick={joinRoom}>UNIRSE</button>
                </div>
            </div>
        </div>
    );
}