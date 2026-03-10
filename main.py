import random
import string
import asyncio
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()
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

    if not easy_mode:
        for r in range(size):
            for c in range(size):
                if board[r][c] == '':
                    board[r][c] = random.choice(string.ascii_uppercase)

    return {"board": board, "wordsToFind": [w["word"] for w in words_placed]}

def generate_pin():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

@sio.event
async def connect(sid, environ):
    print(f"Un usuario conectado: {sid}")

@sio.event
async def createRoom(sid, data):
    nickname = data.get('nickname', 'Host')
    easy_mode = data.get('easy_mode', False) 
    pin = generate_pin()
    
    game_data = generate_board(easy_mode=easy_mode)
    
    rooms[pin] = {
        "pin": pin,
        "easy_mode": easy_mode,
        "board": game_data["board"],
        "wordsToFind": game_data["wordsToFind"],
        "foundWords": [],
        "players": [
            {"id": sid, "name": nickname, "score": 0, "role": "host"}
        ],
        "turnIndex": 0,
        "timeLeft": 30,
        "status": "waiting",
        "task": None 
    }
    
    await sio.enter_room(sid, pin)
    await sio.emit('roomCreated', {'pin': pin}, room=sid)

@sio.event
async def joinRoom(sid, data):
    pin = data.get('pin')
    nickname = data.get('nickname', 'Guest')
    
    room = rooms.get(pin)
    if room and len(room['players']) < 2 and room['status'] == 'waiting':
        room['players'].append({"id": sid, "name": nickname, "score": 0, "role": "guest"})
        await sio.enter_room(sid, pin)
        
        room['status'] = 'playing'
        await sio.emit('gameStarted', {
            "players": room['players'],
            "board": room['board'],
            "wordsToFind": room['wordsToFind'],
            "turnIndex": room['turnIndex']
        }, room=pin)
        
        room['task'] = asyncio.create_task(turn_timer(pin))
    else:
        await sio.emit('errorMsg', 'Sala no encontrada o llena.', room=sid)

async def turn_timer(pin):
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
    room['timeLeft'] = 30 
    await sio.emit('turnChanged', {"turnIndex": room['turnIndex']}, room=pin)

@sio.event
async def submitWord(sid, data):
    pin = data.get('pin')
    startCoords = data.get('startCoords')
    endCoords = data.get('endCoords')
    selectedWord = data.get('selectedWord', '')

    room = rooms.get(pin)
    if not room or room['status'] != 'playing': return

    currentPlayer = room['players'][room['turnIndex']]
    if sid != currentPlayer['id']: return

    reversedWord = selectedWord[::-1]
    validWord = None

    if selectedWord in room['wordsToFind']: validWord = selectedWord
    elif reversedWord in room['wordsToFind']: validWord = reversedWord

    notFoundYet = validWord and not any(fw['word'] == validWord for fw in room['foundWords'])

    if validWord and notFoundYet:
        room['foundWords'].append({"word": validWord, "byPlayerId": sid})
        currentPlayer['score'] += 1

        await sio.emit('wordFound', {
            "word": validWord, "startCoords": startCoords,
            "endCoords": endCoords, "players": room['players'],
            "foundWords": room['foundWords']
        }, room=pin)

        if len(room['foundWords']) == len(room['wordsToFind']):
            await endGame(pin)
            return

    await change_turn(pin)

async def endGame(pin):
    room = rooms.get(pin)
    if not room: return

    if room.get('task'): room['task'].cancel()
    room['status'] = 'finished'

    p1 = room['players'][0]
    p2 = room['players'][1]
    winner = None

    if p1['score'] > p2['score']: winner = p1
    elif p2['score'] > p1['score']: winner = p2

    await sio.emit('gameOver', {"winner": winner, "players": room['players']}, room=pin)

@sio.event
async def playAgain(sid, data):
    pin = data.get('pin')
    room = rooms.get(pin)
    
    if room and room['status'] == 'finished':
        game_data = generate_board(easy_mode=room.get('easy_mode', False))
        
        room['board'] = game_data['board']
        room['wordsToFind'] = game_data['wordsToFind']
        room['foundWords'] = []
        room['turnIndex'] = 0
        room['timeLeft'] = 30
        room['status'] = 'playing'
        
        for p in room['players']: p['score'] = 0
            
        await sio.emit('gameRestarted', {
            "players": room['players'], "board": room['board'],
            "wordsToFind": room['wordsToFind'], "turnIndex": room['turnIndex']
        }, room=pin)
        
        room['task'] = asyncio.create_task(turn_timer(pin))

@sio.event
async def disconnect(sid):
    for pin, room in list(rooms.items()):
        player_idx = next((i for i, p in enumerate(room['players']) if p['id'] == sid), -1)
        if player_idx != -1:
            if room.get('task'): room['task'].cancel()
            await sio.emit('playerDisconnected', 'El otro jugador se ha desconectado. El juego terminó.', room=pin)
            del rooms[pin]
            break

if __name__ == '__main__':
    uvicorn.run("main:socket_app", host="0.0.0.0", port=3000, reload=True)