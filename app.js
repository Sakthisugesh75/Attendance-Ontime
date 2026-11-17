/**
 * Startup file for cPanel's "Setup Node.js App" (Phusion Passenger).
 * cPanel runs this file and tells it which port to use; it serves the build in .next.
 * Not used locally: there, `npm run serve` / `npm start` run the app.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
process.env.NODE_ENV ||= "production";

const { createServer } = require("node:http");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(process.env.PORT || 6001, () => {
      console.log(`Attendance is running (port ${process.env.PORT || 6001})`);
    });
  })
  .catch((err) => {
    console.error("Attendance failed to start:", err);
    process.exit(1);
  });
