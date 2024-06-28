const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require('dotenv').config();

const app = express().use(bodyParser.json());

const token = process.env.TOKEN;
const mytoken = process.env.MYTOKEN;

let orders = {};
let menuItems = [
    { id: "1", title: "Idly", price: 20 },
    { id: "2", title: "Vade", price: 10 },
    { id: "3", title: "Pulav", price: 45 },
    { id: "4", title: "Ghee Masala Dosa", price: 45 },
    { id: "5", title: "Pudi Masala Dosa", price: 55 },
    { id: "6", title: "Bhatu Masala Dosa", price: 45 },
    { id: "7", title: "Khali Masala Dosa", price: 35 }
];

const catalog = `
Catalog📄\n
1. View Menu
2. Place Order
3. Edit Order

Please choose an option by typing the corresponding number.`;

// Start server
app.listen(process.env.PORT, () => {
    console.log("Webhook is listening");
});

app.get("/webhook", (req, res) => {
    let mode = req.query["hub.mode"];
    let challenge = req.query["hub.challenge"];
    let token = req.query["hub.verify_token"];

    if (mode && token) {
        if (mode === "subscribe" && token === mytoken) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post("/webhook", async (req, res) => {
    try {
        let body_param = req.body;

        console.log(JSON.stringify(body_param, null, 2));

        if (body_param.object) {
            console.log("inside body param");
            if (body_param.entry &&
                body_param.entry[0].changes &&
                body_param.entry[0].changes[0].value.messages &&
                body_param.entry[0].changes[0].value.messages[0]
            ) {
                let phon_no_id = body_param.entry[0].changes[0].value.metadata.phone_number_id;
                let from = body_param.entry[0].changes[0].value.messages[0].from;
                let msg_body = body_param.entry[0].changes[0].value.messages[0].interactive?.list_reply?.id || body_param.entry[0].changes[0].value.messages[0].interactive?.button_reply?.id || body_param.entry[0].changes[0].value.messages[0].text.body;

                console.log("phone number " + phon_no_id);
                console.log("from " + from);
                console.log("body param " + msg_body);

                await handleIncomingMessage(phon_no_id, from, msg_body);
                res.sendStatus(200);
            } else {
                res.sendStatus(404);
            }
        }
    } catch (error) {
        console.error("Error handling webhook event: ", error);
        res.sendStatus(500);
    }
});

async function handleIncomingMessage(phon_no_id, sender, message) {
    try {
        if (message === 'Start') {
            await sendCatalog(phon_no_id, sender);
        } else if (message === 'View Menu') {
            await sendMenu(phon_no_id, sender);
        } else if (message === 'Place Order') {
            await sendOrderSummary(phon_no_id, sender);
        } else if (message === 'Edit Order') {
            await sendEditOrderOptions(phon_no_id, sender);
        } else if (message.startsWith('Item_')) {
            const itemId = message.split('_')[1];
            const item = menuItems.find(i => i.id === itemId);
            if (item) {
                await sendQuantityPrompt(phon_no_id, sender, item);
            }
        } else if (message.startsWith('Qty_')) {
            const [itemId, qty] = message.split('_').slice(1);
            const quantity = parseInt(qty);
            if (!isNaN(quantity) && quantity > 0) {
                if (!orders[sender]) {
                    orders[sender] = [];
                }
                const item = menuItems.find(i => i.id === itemId);
                const existingItem = orders[sender].find(i => i.id === itemId);
                if (existingItem) {
                    existingItem.quantity += quantity;
                } else {
                    orders[sender].push({ ...item, quantity });
                }
                await sendCatalog(phon_no_id, sender, `Added ${quantity} x ${item.title} to your order. What would you like to do next?`);
            } else {
                await sendReply(phon_no_id, sender, 'Invalid quantity. Please enter a valid number.');
            }
        } else if (message.startsWith('Remove_')) {
            const itemId = message.split('_')[1];
            if (orders[sender]) {
                orders[sender] = orders[sender].filter(item => item.id !== itemId);
                await sendCatalog(phon_no_id, sender, `Removed item from your order. What would you like to do next?`);
            }
        } else {
            await sendReply(phon_no_id, sender, 'Invalid input. Please send "Start" to view the catalog.');
        }
    } catch (error) {
        console.error("Error handling incoming message: ", error);
    }
}

async function sendCatalog(phon_no_id, sender, extraMessage = '') {
    const catalogMessage = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: sender,
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: "Catalog📄"
            },
            body: {
                text: `${extraMessage}\nPlease choose an option:`
            },
            action: {
                button: "Select",
                sections: [
                    {
                        title: "Options",
                        rows: [
                            { id: "View Menu", title: "View Menu" },
                            { id: "Place Order", title: "Place Order" },
                            { id: "Edit Order", title: "Edit Order" }
                        ]
                    }
                ]
            }
        }
    };

    await sendReplyInteractive(phon_no_id, sender, catalogMessage);
}

async function sendMenu(phon_no_id, sender, extraMessage = '') {
    const menuMessage = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: sender,
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: "MENU📄"
            },
            body: {
                text: `${extraMessage}\nPlease choose an item:`
            },
            action: {
                button: "Select",
                sections: [
                    {
                        title: "Menu Items",
                        rows: menuItems.map(item => ({
                            id: `Item_${item.id}`,
                            title: item.title,
                            description: `₹${item.price}`
                        }))
                    }
                ]
            }
        }
    };

    await sendReplyInteractive(phon_no_id, sender, menuMessage);
}

async function sendQuantityPrompt(phon_no_id, sender, item) {
    const quantityMessage = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: sender,
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: `Quantity for ${item.title}`
            },
            body: {
                text: `Please select the quantity for ${item.title}:`
            },
            action: {
                button: "Select",
                sections: [
                    {
                        title: "Quantities",
                        rows: Array.from({ length: 10 }, (_, i) => ({
                            id: `Qty_${item.id}_${i + 1}`,
                            title: `${i + 1}`
                        }))
                    }
                ]
            }
        }
    };

    await sendReplyInteractive(phon_no_id, sender, quantityMessage);
}

async function sendEditOrderOptions(phon_no_id, sender) {
    const order = orders[sender] || [];
    if (order.length === 0) {
        await sendReply(phon_no_id, sender, "Your order is empty.");
        return;
    }
    const editOrderMessage = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: sender,
        type: "interactive",
        interactive: {
            type: "list",
            header: {
                type: "text",
                text: "Edit Order"
            },
            body: {
                text: "Select an item to remove from your order:"
            },
            action: {
                button: "Select",
                sections: [
                    {
                        title: "Order Items",
                        rows: order.map(item => ({
                            id: `Remove_${item.id}`,
                            title: item.title,
                            description: `Quantity: ${item.quantity}`
                        }))
                    }
                ]
            }
        }
    };

    await sendReplyInteractive(phon_no_id, sender, editOrderMessage);
}

async function sendOrderSummary(phon_no_id, sender) {
    let orderSummary = "Order Summary:\n";
    let totalAmount = 0;

    if (orders[sender] && orders[sender].length > 0) {
        orders[sender].forEach(item => {
            const itemTotal = item.price * item.quantity;
            totalAmount += itemTotal;
            orderSummary += `${item.title} x ${item.quantity} = ₹${itemTotal}\n`;
        });
        orderSummary += `Total Amount: ₹${totalAmount}`;
    } else {
        orderSummary = "You have no items in your order.";
    }

    await sendReply(phon_no_id, sender, orderSummary);
    resetOrder(sender);
}

async function sendReply(phon_no_id, sender, reply) {
    try {
        await axios({
            method: "POST",
            url: `https://graph.facebook.com/v13.0/${phon_no_id}/messages?access_token=${token}`,
            data: {
                messaging_product: "whatsapp",
                to: sender,
                text: {
                    body: reply
                }
            },
            headers: {
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("Error sending reply: ", error);
    }
}

async function sendReplyInteractive(phon_no_id, sender, interactiveMessage) {
    try {
        await axios({
            method: "POST",
            url: `https://graph.facebook.com/v13.0/${phon_no_id}/messages?access_token=${token}`,
            data: interactiveMessage,
            headers: {
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("Error sending interactive message: ", error);
    }
}

function resetOrder(sender) {
    orders[sender] = [];
}

app.get("/", (req, res) => {
    res.status(200).send("Hello, this is webhook setup on port",PORT);
});
