import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socketService from '../socket';
import './Lobby.css';

export default function Lobby() {
    const { state } = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        // Si no hay datos de estado (alguien entró directo a la URL), devolver a inicio
        if (!state || !state.pin) {
            navigate('/');
            return;
        }

        const socket = socketService.getSocket();
        if (!socket) {
            navigate('/');
            return;
        }

        // Cuando el servidor avisa que el juego empezó (se unió el jugador 2)
        socket.on('gameStarted', (gameData) => {
            // Pasamos todos los datos a la pantalla de Juego
            console.log("¡El anfitrión recibió gameStarted!", gameData);
            navigate('/game', { 
                state: { 
                    gameData, 
                    pin: state.pin, 
                    nickname: state.nickname 
                } 
            });
        });

        // Por si el servidor se cae o el jugador se desconecta
        socket.on('disconnect', () => {
            alert('Desconectado del servidor.');
            navigate('/');
        });

        return () => {
            socket.off('gameStarted');
            socket.off('disconnect');
        };
    }, [navigate, state]);

    if (!state) return null;

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