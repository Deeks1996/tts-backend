import express from "express";
import supabase from "../config/supabaseClient.js";

const router = express.Router();

// User Registration
router.post("/register", async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (error) 
    return res.status(400).json({ error: error.message });
    return res.status(201).json({ message: "User registered successfully", data });
});

// User Login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) 
    return res.status(400).json({ error: error.message });
    return res.status(200).json({ message: "Login successful", data });
});

export default router;