require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");
const { connectMongo, getMongo } = require("./mongo");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Root Route
app.get("/", (req, res) => {
    res.json({ message: "ERA Tech Solutions Helpdesk API is running"});
});

//GET /departments
app.get("/departments", (req, res) => {
    const sql = "SELECT * FROM departments";
    db.query(sql, (error, results) => {
        if (error) {
            console.error("Error getting departments:", error);
            return res.status(500).json({ error: "Failed to get departments" });
        }
        res.json(results);
    });
});

// GET /users
app.get("/users", (req, res) => {
    const sql = "SELECT id, first_name, last_name, email, role, department_id FROM users";
    db.query(sql, (error, results) => {
        if (error) {
            console.error("Error getting users:", error);
            return res.status(500).json({ error: "Failed to get users" });
        }
        res.json(results);
    });
});

// GET /tickets
app.get("/tickets", (req, res) => {
    const sql = "SELECT * FROM tickets";
    db.query(sql, (error, results) => {
        if (error) {
            console.error("Error getting tickets:", error);
            return res.status(500).json({ error: "Failed to get tickets" });
        }
        res.json(results);
    });
});

// GET /tickets/open
app.get("/tickets/open", (req, res) => {
    const sql = "SELECT * FROM tickets WHERE status = 'open'";
    db.query(sql, (error, results) => {
        if (error) {
            console.error("Error getting open tickets:", error);
            return res.status(500).json({ error: "Failed to get open tickets" });
        }
        res.json(results);
    });
});

// GET /tickets/:id
app.get("/tickets/:id", (req, res) => {
    const ticketId = req.params.id;
    const sql = "SELECT * FROM tickets WHERE id = ?";
    db.query(sql, [ticketId], (error, results) => {
        if (error) {
            console.error("Error getting ticket:", error);
            return res.status(500).json({ error: "failed to get ticket" });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        res.json(results[0]);
    });
});

// GET /tickets-notes
app.get("/tickets-notes", async (req, res) => {
    try {
        const mongoDb = getMongo();
        const notes = await mongoDb.collection("ticket_notes").find({}).toArray();
        res.json(notes);
    }
    catch (error) {
        console.error("Error getting ticket notes:", error);
        res.status(500).json({ error: "Failed to get ticket notes" });
    }
});

// GET /tickets-notes/:ticketId
app.get("/tickets-notes/:ticketId", async (req, res) => {
    try {
        const ticketId = parseInt(req.params.ticketId);
        const mongoDb = getMongo();
        const notes = await mongoDb.collection("ticket_notes").find({ ticket_id: ticketId }).toArray();
        res.json(notes);
    }
    catch (error) {
        console.error("Error getting notes for ticket:", error);
        res.status(500).json({ error: "Failed to get ticket notes" });
    }
});

// GET /activity-logs
app.get("/activity-logs", async (req, res) => {
    try {
        const mongoDb = getMongo();
        const logs = await mongoDb.collection("activity_logs").find({}).sort({timestamp: -1}).toArray();
        res.json(logs);
    }
    catch (error) {
        console.error("Error getting activity logs:", error);
        res.status(500).json({ error: "Failed to get activity logs" });
    }
});

// POST /users
app.post("/users", (req, res) => {
    const { first_name, last_name, email, password, role, department_id } = req.body;
    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ error: "first_name, last_name, email, password are required" });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }
    const specialChar = /[!@#$%]/;
    if (!specialChar.test(password)) {
        return res.status(400).json({ error: "Password must include at  least 1 special character: !@#$%" });
    }
    const sql = "INSERT INTO users (first_name, last_name, email, password, role, department_id) VALUES (?, ?, ?, ?, ?, ?)";
    const userRole = role || "employee";
    const deptId = department_id || null;
    db.query(sql, [first_name, last_name, email, password, userRole, deptId], (error, results) => {
        if (error) {
            console.error("Error creating user:", error);
            return res.status(500).json({ error: "Failed to create user" });
        }
        res.status(201).json({ message: "User created successfully", userId: results.insertId });
    });
});

// POST /tickets
app.post("/tickets", async (req, res) => {
    const { title, description, priority, status, submitted_by, assigned_to, department_id } = req.body;
    if (!title || !submitted_by) {
        return res.status(400).json({ error: "Title and submitted_by are required" });
    }
    const ticketPriority = priority || "medium";
    const ticketStatus = status || "open";
    const assignedTo = assigned_to || null;
    const deptId = department_id || null;
    
    const sql = "INSERT INTO tickets (title, description, priority, status, submitted_by, assigned_to, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
    db.query(sql, [title, description, ticketPriority, ticketStatus, submitted_by, assignedTo, deptId], async (error, results) => {
        if (error) {
            console.error("Error creating ticket:", error);
            return res.status(500).json({ error: "Failed to create ticket" });
        }
        const newTicketId = results.insertId;
        try {
            const mongoDb = getMongo();
            await mongoDb.collection("activity_logs").insertOne({
                action: "ticket_created",
                user_id: submitted_by,
                ticket_id: newTicketId, 
                details: `ticket created: ${title}`,
                timestamp: new Date()
            });
        }
        catch (mongoError) {
            console.error("Failed to log activity:", mongoError);
        }
        res.status(201).json({ message: "Ticket created successfully", ticketId: newTicketId });
    });
});

// POST /tickets-notes
app.post("/ticket-notes", async (req, res) => {
    const { ticket_id, note, added_by } = req.body;
    if (!ticket_id || !note || !added_by) {
        return res.status(400).json({ error: "ticket_id, note, and added_by are required" });
    }
    try {
        const mongoDb = getMongo();
        const result = await mongoDb.collection("ticket_notes").insertOne({
            ticket_id: parseInt(ticket_id),
            note: note,
            added_by: added_by,
            created_at: new Date() });
            res.status(201).json({ message: "Note added successfully",
                noteId: result.insertedId
            });
        }
        catch (error) {
            console.error("Error adding note:", error);
            res.status(500).json({ error: "Failed to add note" });
        }
    });
    
    // POST /activity-logs
    app.post("/activity-logs", async (req, res) => {
        const { action, user_id, ticket_id, details } = req.body;
        if (!action || !details) {
            return res.status(400).json({ error: "Action and details are required" });
        }
        try {
            const mongoDb = getMongo();
            const result = await mongoDb.collection("activity_logs").insertOne({
                action: action,
                user_id: user_id || null,
                ticket_id: ticket_id || null,
                details: details,
                timestamp: new Date()
            });
            res.status(201).json({ message: "Activity log created", log_id: result.insertedId });
        }
        catch (error) {
            console.error("Error creating activity log:", error);
            res.status(500).json({ error: "Failed to create activity log" });
        }
    });
    


async function startServer() {
    await connectMongo();
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

startServer();