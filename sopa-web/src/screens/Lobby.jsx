import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socketService from '../socket';
import './Lobby.css';

export default function Lobby() {
    const { state } = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (!state || !state.pin) {
            navigate('/');
            return;
        }

        const socket = socketService.getSocket();
        if (!socket) {
            navigate('/');
            return;
        }

        // 1. Creamos la función que manejará el evento
        const handleGameStart = (gameData) => {
            console.log("¡El anfitrión recibió gameStarted!", gameData);
            navigate('/game', { 
                state: { gameData, pin: state.pin, nickname: state.nickname } 
            });
        };

        const handleDisconnect = () => {
            alert('Desconectado del servidor.');
            navigate('/');
        };

        // 2. Escuchamos el evento
        socket.on('gameStarted', handleGameStart);
        socket.on('disconnect', handleDisconnect);

        // 3. Limpiamos SOLO estas funciones específicas cuando el componente se desmonte
        return () => {
            socket.off('gameStarted', handleGameStart);
            socket.off('disconnect', handleDisconnect);
        };
    }, [navigate, state]);

    const handleCancel = () => {
        const socket = socketService.getSocket();
        if (socket) socket.disconnect();
        navigate('/');
    };

    return (
        <div className="lobby-container">
            <div className="lobby-card">
                <h2>Sala de Espera</h2>
                
                <div className="pin-display">
                    <span>Comparte este PIN con tu amigo</span>
                    <h1>{state.pin}</h1>
                </div>

                <p className="waiting-text">
                    Esperando a que se una el otro jugador...
                </p>

                <div className="loader"></div>

                <button className="btn-cancel" onClick={handleCancel}>
                    Cancelar y Salir
                </button>
            </div>
        </div>
    );
}