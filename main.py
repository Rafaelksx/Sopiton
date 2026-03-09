import random
import string
import asyncio
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configurar el servidor Socket.io asíncrono
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()

# Añadir el servidor de sockets a la aplicación FastAPI
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

WORDS_POOL = [
    "CASA", "PERRO", "GATO", "MESA", "SILLA", "RELOJ", "CARRO", "MUNDO",
    "CIELO", "ARBOL", "HOJA", "AGUA", "FUEGO", "MAR", "SOL", "LUNA", "ESTRELLA"
]

rooms = {}

def generate_board(easy_mode=False):
    size = 10
    board = [['' for _ in range(size)] for _ in range(size)]
    words_placed = []

    # Seleccionar 8 palabras al azar
    selected_words = random.sample(WORDS_POOL, min(8, len(WORDS_POOL)))

    for word in selected_words:
        placed = False
        attempts = 0
        while not placed and attempts < 100:
            attempts += 1
            is_horizontal = random.choice([True, False])
            row = random.randint(0, size - 1)
            col = random.randint(0, size - 1)

            if is_horizontal:
                if col + len(word) <= size:
                    can_place = True
                    for i in range(len(word)):
                        if board[row][col + i] != '' and board[row][col + i] != word[i]:
                            can_place = False
                            break
                    if can_place:
                        for i in range(len(word)):
                            board[row][col + i] = word[i]
                        placed = True
                        words_placed.append({"word": word, "pos": {"r": row, "c": col, "dir": "H"}})
            else:
                if row + len(word) <= size:
                    can_place = True
                    for i in range(len(word)):
                        if board[row + i][col] != '' and board[row + i][col] != word[i]:
                            can_place = False
                            break
                    if can_place:
                        for i in range(len(word)):
                            board[row + i][col] = word[i]
                        placed = True
                        words_placed.append({"word": word, "pos": {"r": row, "c": col, "dir": "V"}})

    # Modo Fácil: Si NO es modo fácil, rellenar con letras aleatorias
    if not easy_mode:
        for r in range(size):
            for c in range(size):
                if board[r][c] == '':
                    board[r][c] = random.choice(string.ascii_uppercase)

    return {"board": board, "wordsToFind": [w["word"] for w in words_placed]}

def generate_pin():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

# --- EVENTOS DE SOCKET.IO ---

@sio.event
async def connect(sid, environ):
    print(f"Un usuario conectado: {sid}")

@sio.event
async def createRoom(sid, data):
    nickname = data.get('nickname', 'Host')
    easy_mode = data.get('easy_mode', False) # Recibe la preferencia de dificultad
    pin = generate_pin()
    
    game_data = generate_board(easy_mode=easy_mode)
    
    rooms[pin] = {
        "pin": pin,
        "board": game_data["board"],
        "wordsToFind": game_data["wordsToFind"],
        "foundWords": [],
        "players": [
            {"id": sid, "name": nickname, "score": 0, "role": "host"}
        ],
        "turnIndex": 0,
        "timeLeft": 30,
        "status": "waiting",
        "task": None # Para guardar la tarea asíncrona del temporizador
    }
    
    sio.enter_room(sid, pin)
    await sio.emit('roomCreated', {'pin': pin}, room=sid)
    print(f"Sala creada: {pin} por {nickname} (Modo Fácil: {easy_mode})")

@sio.event
async def joinRoom(sid, data):
    pin = data.get('pin')
    nickname = data.get('nickname', 'Guest')
    
    room = rooms.get(pin)
    if room and len(room['players']) < 2 and room['status'] == 'waiting':
        room['players'].append({"id": sid, "name": nickname, "score": 0, "role": "guest"})
        sio.enter_room(sid, pin)
        
        room['status'] = 'playing'
        await sio.emit('gameStarted', {
            "players": room['players'],
            "board": room['board'],
            "wordsToFind": room['wordsToFind'],
            "turnIndex": room['turnIndex']
        }, room=pin)
        
        # Iniciar temporizador (ejemplo simplificado)
        room['task'] = asyncio.create_task(turn_timer(pin))
        print(f"{nickname} se unió a la sala {pin}")
    else:
        await sio.emit('errorMsg', 'Sala no encontrada o llena.', room=sid)

async def turn_timer(pin):
    """Maneja el tiempo de cada turno de forma asíncrona"""
    room = rooms.get(pin)
    while room and room['status'] == 'playing':
        room['timeLeft'] -= 1
        await sio.emit('timerUpdate', room['timeLeft'], room=pin)
        
        if room['timeLeft'] <= 0:
            await change_turn(pin)
        await asyncio.sleep(1)

async def change_turn(pin):
    room = rooms.get(pin)
    if not room or room['status'] != 'playing':
        return
    room['turnIndex'] = 1 if room['turnIndex'] == 0 else 0
    room['timeLeft'] = 30 # Reiniciar tiempo
    await sio.emit('turnChanged', {"turnIndex": room['turnIndex']}, room=pin)

@sio.event
async def disconnect(sid):
    print(f"Usuario desconectado: {sid}")
    for pin, room in list(rooms.items()):
        player_idx = next((i for i, p in enumerate(room['players']) if p['id'] == sid), -1)
        if player_idx != -1:
            if room.get('task'):
                room['task'].cancel()
            await sio.emit('playerDisconnected', 'El otro jugador se ha desconectado. El juego terminó.', room=pin)
            del rooms[pin]
            break

if __name__ == '__main__':
    uvicorn.run("main:socket_app", host="0.0.0.0", port=3000, reload=True)