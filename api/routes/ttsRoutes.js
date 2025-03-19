import express from "express";
import multer from "multer";
import axios from "axios";
import supabase from "../config/supabaseClient.js";
import dotenv from 'dotenv';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

dotenv.config();

// Middleware to Verify Supabase Auth Token
const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized: No token provided" });
    console.log("Token :", token);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Unauthorized: Invalid token" });
    
    req.user = data.user;
    next();
};

// Convert Text to Speech and Store in Database
router.post("/convert", verifyToken, upload.single("file"), async (req, res) => {
    const { text } = req.body;
    const userId = req.user.id;
    let inputText = text;

    console.log("Uploaded file", req.file);
    
    if (req.file) {
        inputText = req.file.buffer.toString("utf-8");
    }

    if (!inputText || inputText.length > 2000) {
        return res.status(400).json({ error: "Invalid input or text exceeds 2000 characters." });
    }

    try {
        // Deepgram API Request
        const response = await axios.post("https://api.deepgram.com/v1/speak", 
            { text: inputText },
            { 
                headers: { 
                    "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`,
                "Content-Type": "application/json",}, 
                responseType: "arraybuffer" }
        );

        const audioBuffer = Buffer.from(response.data);
        const audioPath = `tts_audio/${Date.now()}.mp3`;
        
        const { data, error: uploadError } = await supabase.storage.from("ttsaudio").upload(audioPath, audioBuffer, {
            contentType: "audio/mpeg"
        });

        if (uploadError) {
            return res.status(500).json({ error: uploadError.message });
        }
        
        const audioUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/ttsaudio/${audioPath}`;

        // Insert Data into Database
        const { error: dbError } = await supabase.from("tts_database").insert([
            { user_id: userId, text: inputText, audio_url: audioUrl, created_at: new Date() }
        ]);
        
        if (dbError) 
        return res.status(500).json({ error: dbError.message });
        return res.status(200).json({ message: "TTS conversion successful", audioUrl });
    } catch (error) {
        return res.status(500).json({ error: "TTS conversion failed." });
    }
});

export default router;
