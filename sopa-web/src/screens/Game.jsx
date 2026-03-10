import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socketService from '../socket';
import './css/Game.css';

export default function Game() {
    const { state } = useLocation();
    const navigate = useNavigate();
    
    if (!state) {
        navigate('/');
        return null;
    }

    const { pin, nickname, gameData } = state;
    const [board, setBoard] = useState(gameData.board);
    const [wordsToFind, setWordsToFind] = useState(gameData.wordsToFind);
    const [players, setPlayers] = useState(gameData.players);
    const [turnIndex, setTurnIndex] = useState(gameData.turnIndex);

    const [timeLeft, setTimeLeft] = useState(30);
    const [selection, setSelection] = useState({ start: null, end: null });
    const [foundWords, setFoundWords] = useState(gameData.foundWords || []);
    const [foundLines, setFoundLines] = useState([]);
    
    const [gameOverData, setGameOverData] = useState(null); // Estado para el modal
    const [playAgainVotes, setPlayAgainVotes] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);

    const me = players.find(p => p.name === nickname);
    const isMyTurn = players[turnIndex]?.name === nickname;

    useEffect(() => {
        const socket = socketService.getSocket();
        if (!socket) {
            navigate('/');
            return;
        }

        socket.on('timerUpdate', (time) => setTimeLeft(time));

        socket.on('turnChanged', ({ turnIndex }) => {
            setTurnIndex(turnIndex);
            setSelection({ start: null, end: null });
        });

        socket.on('wordFound', ({ word, startCoords, endCoords, players: updatedPlayers, foundWords: newFoundWords }) => {
            setPlayers(updatedPlayers);
            setFoundWords(newFoundWords);
            const playerColor = newFoundWords.find(fw => fw.word === word)?.byPlayerId === me?.id ? '#8b5cf6' : '#0ea5e9';
            setFoundLines(prev => [...prev, { startCoords, endCoords, color: playerColor }]);
        });

        socket.on('gameOver', ({ winner, players }) => {
            setPlayers(players);
            setGameOverData({ winner });
            setPlayAgainVotes(0); // Reinicia contador visual
            setHasVoted(false);   // Reinicia tu botón
        });

        socket.on('playAgainUpdate', ({ votes }) => {
            setPlayAgainVotes(votes);
        });

        socket.on('gameRestarted', (newGameData) => {
            setBoard(newGameData.board);
            setWordsToFind(newGameData.wordsToFind);
            setPlayers(newGameData.players);
            setTurnIndex(newGameData.turnIndex);
            setFoundWords([]);
            setFoundLines([]);
            setSelection({ start: null, end: null });
            setTimeLeft(30);
            setGameOverData(null); 
            // Reiniciar estados del modal
            setPlayAgainVotes(0);
            setHasVoted(false);
        });

        socket.on('playerDisconnected', (msg) => {
            alert(msg);
            navigate('/');
        });

        return () => {
            socket.off('timerUpdate');
            socket.off('turnChanged');
            socket.off('wordFound');
            socket.off('gameOver');
            socket.off('gameRestarted');
            socket.off('playerDisconnected');
        };
    }, [navigate, me?.id]);

    const handleCellClick = (r, c) => {
        if (!isMyTurn || gameOverData) return; // No dejar hacer clic si terminó el juego

        if (!selection.start) {
            setSelection({ start: { r, c }, end: null });
        } else {
            const end = { r, c };
            const dr = end.r - selection.start.r;
            const dc = end.c - selection.start.c;

            const isHorizontal = dr === 0;
            const isVertical = dc === 0;
            const isDiagonal = Math.abs(dr) === Math.abs(dc);

            if (isHorizontal || isVertical || isDiagonal) {
                let selectedWord = "";
                let steps = Math.max(Math.abs(dr), Math.abs(dc));
                let stepR = dr === 0 ? 0 : dr / steps;
                let stepC = dc === 0 ? 0 : dc / steps;

                for (let i = 0; i <= steps; i++) {
                    selectedWord += board[selection.start.r + i * stepR][selection.start.c + i * stepC];
                }

                const socket = socketService.getSocket();
                socket.emit('submitWord', { pin, startCoords: selection.start, endCoords: end, selectedWord });
            } else {
                setSelection({ start: { r, c }, end: null });
                return; 
            }

            setSelection({ start: null, end: null });
        }
    };

    const getCellColor = (r, c) => {
        for (let line of foundLines) {
            const { startCoords, endCoords, color } = line;
            const dr = endCoords.r - startCoords.r;
            const dc = endCoords.c - startCoords.c;
            let steps = Math.max(Math.abs(dr), Math.abs(dc));
            let stepR = dr === 0 ? 0 : dr / steps;
            let stepC = dc === 0 ? 0 : dc / steps;

            for (let i = 0; i <= steps; i++) {
                if (startCoords.r + i * stepR === r && startCoords.c + i * stepC === c) return color;
            }
        }
        if (selection.start && selection.start.r === r && selection.start.c === c) return '#f59e0b';
        return 'transparent';
    };

    return (
        <div className="game-container">
            <div className="game-layout">
                <div className="board-section">
                    <div className="board-header">
                        <h2>Sala: <span>{pin}</span></h2>
                        <div className={`timer ${timeLeft <= 5 ? 'danger' : ''}`}>
                            00:{timeLeft.toString().padStart(2, '0')}
                        </div>
                    </div>

                    <div className="turn-indicator">
                        <h3 className={isMyTurn ? 'my-turn' : 'their-turn'}>
                            {isMyTurn ? "👉 ¡Es tu turno!" : `⏳ Turno de ${players[turnIndex]?.name}`}
                        </h3>
                        <p>Haz clic en la 1ª letra y luego en la última para formar la palabra.</p>
                    </div>

                  <div className={`grid-board ${(!isMyTurn && !gameOverData) ? 'blurred-board' : ''}`}>
                        {board.map((row, r) => (
                            row.map((cell, c) => {
                                const bgColor = getCellColor(r, c);
                                const isFilled = bgColor !== 'transparent';
                                
                                return (
                                    <div 
                                        key={`cell-${r}-${c}`}
                                        className={`grid-cell ${isFilled ? 'filled' : ''} ${isMyTurn ? 'clickable' : ''}`}
                                        style={{ backgroundColor: bgColor }}
                                        onClick={() => handleCellClick(r, c)}
                                    >
                                        {cell}
                                    </div>
                                );
                            })
                        ))}
                    </div>
                </div>

                <div className="sidebar-section">
                    <div className="players-card">
                        {players.map((p, idx) => (
                            <div key={p.id} className={`player-row ${turnIndex === idx ? 'active-player' : ''}`}>
                                <div>
                                    <span className="player-name">{p.name}</span>
                                    {p.id === me?.id && <span className="you-badge">Tú</span>}
                                </div>
                                <span className="player-score">{p.score} pts</span>
                            </div>
                        ))}
                    </div>

                    <div className="words-card">
                        <h3>Palabras Ocultas</h3>
                        <div className="words-list">
                            {wordsToFind.map(word => {
                                const isFound = foundWords.some(fw => fw.word === word);
                                return (
                                    <span key={word} className={`word-pill ${isFound ? 'found' : ''}`}>{word}</span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL DE FIN DE JUEGO */}
            {gameOverData && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>¡Juego Terminado!</h2>
                        <p className="modal-message">
                            {gameOverData.winner 
                                ? (gameOverData.winner.id === me?.id ? "🏆 ¡Ganaste la partida!" : "💥 ¡Has perdido!") 
                                : "🤝 ¡Es un empate!"}
                        </p>
                        
                        {/* NUEVO: Marcador final */}
                        <div className="modal-scoreboard">
                            <h3>Puntuación Final</h3>
                            {players.map(p => (
                                <div key={p.id} className={`modal-score-row ${p.id === me?.id ? 'me' : ''}`}>
                                    <span>{p.name} {p.id === me?.id && "(Tú)"}</span>
                                    <span className="modal-points">{p.score} pts</span>
                                </div>
                            ))}
                        </div>

                        <div className="modal-buttons">
                            <button 
                                className={`btn-play-again ${hasVoted ? 'voted' : ''}`} 
                                disabled={hasVoted}
                                onClick={() => {
                                    setHasVoted(true);
                                    socketService.getSocket().emit('playAgain', { pin });
                                }}>
                                {hasVoted ? `Esperando... (${playAgainVotes}/2)` : (playAgainVotes > 0 ? `Jugar de Nuevo (${playAgainVotes}/2)` : "Jugar de Nuevo")}
                            </button>
                            <button 
                                className="btn-leave" 
                                onClick={() => {
                                    socketService.disconnect();
                                    navigate('/');
                                }}>
                                Salir al Inicio
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}