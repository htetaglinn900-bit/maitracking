export default async function handler(req, res) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DATABASE_ID = process.env.NOTION_DATABASE_ID;

    try {
        // Step 1: Query Target Order
        const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filter: { property: 'ပါဆယ် နံပါတ်', rich_text: { equals: id } }
            })
        });

        const data = await response.json();
        if (!data.results || data.results.length === 0) return res.status(404).json({ error: "ID Not Found" });

        const pageData = data.results[0];
        const page = pageData.properties;

        // Robust Value Extractor
        const parseProp = (prop) => {
            if (!prop) return "0";
            if (prop.type === 'formula') {
                const f = prop.formula;
                if (!f) return "0";
                if (f.type === 'number') return f.number !== null && f.number !== undefined ? f.number.toString() : "0";
                if (f.type === 'string') return f.string || "0";
                return "0";
            }
            if (prop.type === 'rollup') {
                const r = prop.rollup;
                if (!r) return "0";
                if (r.type === 'number') return r.number !== null && r.number !== undefined ? r.number.toString() : "0";
                if (r.type === 'array' && r.array && r.array.length > 0) {
                    const item = r.array[0];
                    if (item.type === 'number') return item.number?.toString() || "0";
                    if (item.type === 'formula' && item.formula.type === 'number') return item.formula.number?.toString() || "0";
                }
                return "0";
            }
            switch (prop.type) {
                case 'title': return prop.title[0]?.plain_text || "";
                case 'rich_text': return prop.rich_text[0]?.plain_text || "";
                case 'select': return prop.select?.name || "";
                case 'status': return prop.status?.name || "";
                case 'number': return prop.number !== null && prop.number !== undefined ? prop.number.toString() : "0";
                case 'date': return prop.date?.start || "";
                default: return "";
            }
        };

        // Current Order Values
        const customerName = parseProp(page['Name']);
        let finalCost = parseProp(page['Total Cost (Baht) - Final']);
        if (!finalCost || finalCost === "0") finalCost = parseProp(page['Total Cost (Baht)']);
        if (!finalCost || finalCost === "0") finalCost = parseProp(page['Total Cost (Baht) - Locked']);

        const orderEarned = parseFloat(parseProp(page['M Point Earned']) || "0");
        const orderUsed = parseFloat(parseProp(page['Points Used']) || "0");

        // Step 2: Out of the Box - Calculate Customer Cumulative Points directly from DB
        let totalCustomerSum = 0;
        let isB2BCustomer = false;

        const profileRelation = page['MAI CARGO - B2B Customer Profiles'];
        if (profileRelation && profileRelation.relation && profileRelation.relation.length > 0) {
            isB2BCustomer = true;
        }

        if (customerName) {
            // Query all orders for this customer to sum total points directly
            const customerOrdersRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${NOTION_TOKEN}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filter: { property: 'Name', rich_text: { equals: customerName } }
                })
            });

            const customerData = await customerOrdersRes.json();
            if (customerData.results) {
                customerData.results.forEach(order => {
                    const props = order.properties;
                    const earned = parseFloat(parseProp(props['M Point Earned']) || "0");
                    const used = parseFloat(parseProp(props['Points Used']) || "0");
                    totalCustomerSum += (earned - used);
                });
            }
        }

        const result = {
            'Name': customerName,
            'BlueBox': parseProp(page['လက်ရှိအခြေအနေ']),
            'BadgeStatus': parseProp(page['Status']),
            'Route': parseProp(page['Route']),
            'Weight': parseProp(page['Weight (kg)']),
            'Cost': finalCost,
            'ETA': parseProp(page['ETA']),
            'MPointEarned': orderEarned.toString(),
            'PointsUsed': orderUsed.toString(),
            'CustomerTotalBalance': totalCustomerSum.toString(),
            'HasB2B': isB2BCustomer
        };

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ error: "Server Error" });
    }
}
