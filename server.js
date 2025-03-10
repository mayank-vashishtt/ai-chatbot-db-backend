const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// MongoDB setup
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

// Connect to MongoDB before handling requests
async function connectMongoDB() {
    try {
        await mongoClient.connect();
        db = mongoClient.db('chat_history'); // Database to store chat history
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit if DB connection fails
    }
}
connectMongoDB();

// Database schema definition
const DATABASE_SCHEMA = `
{
    "skus": {
        "_id": "ObjectId",
        "name": "string",
        "purchase_cost": "decimal",
        "packaging_cost": "decimal",
        "factory_to_warehouse_cost": "object",
        "warehouse_to_fba_cost": "object",
        "last_mile_cost": "object",
        "mrp": "decimal",
        "quantity_in_min_unit": "integer",
        "asin": "string",
        "client_id": "ObjectId",
        "tags": "array",
        "createdAt": "Date",
        "updatedAt": "Date"
    }
}`;



// Context preparation function
const prepareSystemContext = (chatHistory) => `
You are a MongoDB AI assistant. You help users analyze data and generate MongoDB queries.

Your task is to provide MongoDB queries based on the following NoSQL database schema:

Database schema:
${DATABASE_SCHEMA}


Guidelines:
- Always return queries in **MongoDB format**, using JavaScript JSON syntax.
- Do NOT return SQL queries.
- Use MongoDB methods such as **find(), aggregate(), updateOne(), insertOne(), deleteOne()**.
- Ensure the output is a properly formatted MongoDB query.
- output should only have query, NOTHING extra


Chat history:
${chatHistory.map(h => `User: ${h.user}\nAI: ${h.ai}`).join('\n')}

Use the chat history to provide relevant answers.
`;

// Store chat in MongoDB
async function storeChatHistory(user, ai) {
    try {
        await db.collection('history').insertOne({ user, ai, timestamp: new Date() });
    } catch (err) {
        console.error("Error storing chat history:", err);
    }
}

// Retrieve chat history
async function getChatHistory() {
    try {
        return await db.collection('history').find().sort({ timestamp: -1 }).limit(5).toArray();
    } catch (err) {
        console.error("Error fetching chat history:", err);
        return [];
    }
}

// Generate response from Gemini
app.post('/api/addtext', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) throw new Error('Prompt is required');

        const chatHistory = await getChatHistory();
        const fullPrompt = `${prepareSystemContext(chatHistory)}\nUser: ${prompt}\nAI:`;

        const result = await model.generateContent(fullPrompt);
        const response = result.response?.text?.() || "No response generated.";

        await storeChatHistory(prompt, response);

        res.json({ success: true, response, message: 'Response generated successfully' });
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ success: false, error: error.message, message: 'Failed to generate response' });
    }
});



// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Start server
const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    await mongoClient.close();
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});
