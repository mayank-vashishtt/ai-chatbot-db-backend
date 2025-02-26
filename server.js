const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Gemini with API key from environment variables
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Database schema definition
const DATABASE_SCHEMA = `
CREATE TABLE skus (
    _id VARCHAR(24) PRIMARY KEY,
    name VARCHAR(255),
    purchase_cost DECIMAL(10,2),
    packaging_cost DECIMAL(10,2),
    factory_to_warehouse_cost JSON,
    warehouse_to_fba_cost JSON,
    last_mile_cost JSON,
    mrp DECIMAL(10,2),
    quantity_in_min_unit INTEGER,
    asin VARCHAR(255),
    client_id VARCHAR(24),
    tags JSON,
    createdAt DATETIME,
    updatedAt DATETIME
);

CREATE TABLE skuordertransactions (
    _id VARCHAR(24) PRIMARY KEY,
    orderId VARCHAR(255),
    sku VARCHAR(255),
    date DATETIME,
    client VARCHAR(24),
    transactionIds JSON,
    tax JSON,
    amazonFees JSON,
    sales JSON,
    createdAt DATETIME,
    updatedAt DATETIME
);`;

// Helper function to prepare system context
const prepareSystemContext = () => `
You are a helpful AI assistant that helps users analyze and query a database. You have access to the following database schema:

${DATABASE_SCHEMA}

When users ask questions, provide helpful responses that might include:
1. SQL queries to get the requested information
2. Explanations of the data structure
3. Suggestions for analysis
4. Help with understanding the relationships between tables


You can write SQL queries to help users get specific information from the database.
`;

// Add the chat endpoint with context
app.post('/api/addtext', async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            throw new Error('Prompt is required');
        }

        // Combine system context with user prompt
        const fullPrompt = `
${prepareSystemContext()}

User question: ${prompt}

Please provide a helpful response that may include SQL queries if relevant.`;

        // Generate response using Gemini
        const result = await model.generateContent(fullPrompt);
        const response = result.response.text();

        res.json({
            success: true,
            response: response,
            message: 'Response generated successfully'
        });

    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            message: 'Failed to generate response'
        });
    }
});

// SQL Query generation endpoint
app.post('/api/generateSQL', async (req, res) => {
    try {
        const { query } = req.body;
        
        if (!query || typeof query !== 'string') {
            throw new Error('Invalid query input: Query must be a non-empty string');
        }

        const prompt = `
You are a SQL query generator. Generate optimized SQL queries based on the provided database schema. 
Always include appropriate JOIN conditions and WHERE clauses. 
Format the SQL query for readability.
Do not include any explanations, only return the SQL query.
and check for the answer in every table before returning it 
for example,
when ask unique client, it should have union of all the distinct client in every table 
not just one table

Database schema:
${DATABASE_SCHEMA}

Generate an SQL query for this request: "${query}"
`;

        const result = await model.generateContent(prompt);
        const sqlQuery = result.response.text().trim();

        res.json({ 
            success: true,
            sqlQuery,
            message: 'Query generated successfully'
        });

    } catch (error) {
        console.error('Error generating SQL query:', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal server error',
            message: 'Failed to generate SQL query'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed. Process terminated.');
        process.exit(0);
    });
});