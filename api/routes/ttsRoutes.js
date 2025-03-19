import express from "express";
import multer from "multer";
import fs from "fs";
import axios from "axios";
import supabase from "../../api/config/supabaseClient.js";
import dotenv from 'dotenv';
const router = express.Router();
const upload = multer({ dest: "uploads/" });

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

    if (req.file) {
        const filePath = req.file.path;
        inputText = fs.readFileSync(filePath, "utf-8");
        fs.unlinkSync(filePath);
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
        const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
        const audioPath = `ttsaudio-/${Date.now()}.mp3`;
        
        const { data, error: uploadError } = await supabase.storage.from("ttsaudio").upload(audioPath, audioBlob, {
            contentType: "audio/mpeg"
        });

        if (uploadError) {
            console.error("Upload error:", uploadError);
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