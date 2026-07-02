require("dotenv").config();

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const PYTHON_HOST = process.env.PYTHON_HOST || "127.0.0.1";
const PYTHON_PORT = process.env.PYTHON_PORT || 5000;


app.use(
    "/api",
    createProxyMiddleware({
        target: `http://${PYTHON_HOST}:${PYTHON_PORT}`,
        changeOrigin: true,
        onError(err, req, res) {
            console.error("Python service unavailable");
            res.status(502).json({ error: "AI engine is offline" });
        },
    })
);


app.use(express.static(path.join(__dirname, "public")));


app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
