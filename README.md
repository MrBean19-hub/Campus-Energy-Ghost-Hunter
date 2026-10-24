# Campus Energy Ghost Hunter

Detects **ghost consumption**: fans, lights and ACs left running in empty classrooms and labs. An ESP32 reads a PIR sensor (occupancy) and an ACS712 current sensor (load) and streams both to a live dark-mode dashboard. When a room has had no motion for a set time while current is still flowing, the system raises an alert and charges the waste to that department's score.

## Features
- Live floor plan, colour-coded per room: occupied, empty, ghost load, offline
- Per-room current history, gauge and ghost-threshold line
- Ghost alerts feed, with optional Telegram notification
- Department savings leaderboard (efficiency = % of energy used while someone was present)
- Energy and cost-wasted estimates (configurable voltage and tariff)
- Demo mode simulates extra rooms, so one ESP32 can show a campus-scale dashboard
- API-key protected ingest endpoint, real-time updates over Server-Sent Events

## Technology stack
| Layer | Tech |
|---|---|
| Hardware | ESP32, HC-SR501 PIR, ACS712-5A, 2x 10 kΩ divider, DC fan + supply |
| Firmware | Arduino IDE, WiFi + HTTPClient |
| Backend | Node.js 18+, Express, dotenv, SSE |
| Dashboard | Vanilla HTML/CSS/JS with inline SVG (no build step) |

## Wiring (matches your prototype)
| From | To |
|---|---|
| PIR OUT | GPIO 27 |
| PIR VCC / GND | 5 V (or 3.3 V per module) / GND |
| ACS712 VCC / GND | 5 V / GND |
| ACS712 OUT | 10 kΩ -> **GPIO 34** node -> 10 kΩ -> GND (divider halves 5 V output to <=3.3 V) |
| Fan | In series with the ACS712 IP+ / IP- terminals and the DC supply |

GPIO 34 is on ADC1, so it keeps working while Wi-Fi is active.

## Project structure
```
firmware/ghost_hunter/   ESP32 sketch + secrets.h.example
backend/                 Express server, rooms.json, public/index.html dashboard
.env.example             Placeholder environment variables
```

## Setup
### 1. Backend + dashboard
```bash
cd backend
npm install
cp .env.example .env      # edit API_KEY and any values you want
npm start
```
Open http://localhost:3000. With `DEMO_MODE=true` the other rooms are simulated.

### 2. Firmware
1. Install the ESP32 board package in Arduino IDE.
2. In `firmware/ghost_hunter/`, copy `secrets.h.example` to `secrets.h` and set Wi-Fi, `SERVER_URL` (your PC's LAN IP, e.g. `http://192.168.1.50:3000/api/readings`), `API_KEY` (same as backend `.env`) and `ROOM_ID` (`lab101` by default).
3. Keep the fan **off**, power the board; it calibrates the baseline for 2 s, then starts sending once per second.
4. Allow port 3000 through your PC firewall. The ESP32 and PC must be on the same network.

### 3. Try it
Turn the fan on and keep still in front of the PIR. After `GHOST_DELAY_SEC` seconds the ECE Lab 101 tile turns red and an alert appears.

## Environment variables
See `.env.example`: `PORT`, `API_KEY`, `NOMINAL_VOLTAGE`, `CURRENT_THRESHOLD_A`, `GHOST_DELAY_SEC`, `TARIFF_PER_KWH`, `DEMO_MODE`, `LIVE_ROOM_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## API
`POST /api/readings` with header `x-api-key` and body `{"roomId":"lab101","motion":1,"current":0.42}`. `GET /api/state` returns a JSON snapshot; `GET /api/stream` streams it live.

## Adding rooms
Edit `backend/rooms.json` (id, name, department, plan position). Flash each ESP32 with its own `ROOM_ID`. Set `DEMO_MODE=false` once real devices are installed.

## Moving beyond the prototype
- The ACS712 sketch measures DC change. For real AC loads use an SCT-013 with a burden resistor and RMS sampling, and set `NOMINAL_VOLTAGE` to mains voltage (power factor is not modelled).
- **Safety:** never wire mains yourself without a qualified electrician; use non-invasive SCT-013 clamps on live installations.
- Data is held in memory and resets on restart; add a database for long-term history.

## License
MIT
