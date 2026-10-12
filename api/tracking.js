export default async function handler(req, res) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DATABASE_ID = process.env.NOTION_DATABASE_ID;

    try {
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

        const page = data.results[0].properties;

        // Robust Notion Property Value Extractor
        const parseNotionProp = (prop) => {
            if (!prop) return "";
            
            // Handle Formula Types
            if (prop.type === 'formula') {
                const f = prop.formula;
                if (!f) return "";
                if (f.type === 'number') return f.number !== null && f.number !== undefined ? f.number.toString() : "0";
                if (f.type === 'string') return f.string || "";
                if (f.type === 'boolean') return f.boolean ? "true" : "false";
                if (f.type === 'date') return f.date?.start || "";
                return "";
            }

            // Handle Rollup Types
            if (prop.type === 'rollup') {
                const r = prop.rollup;
                if (!r) return "0";
                if (r.type === 'number') return r.number !== null && r.number !== undefined ? r.number.toString() : "0";
                if (r.type === 'array' && r.array.length > 0) {
                    const item = r.array[0];
                    if (item.type === 'number') return item.number?.toString() || "0";
                    if (item.type === 'formula') {
                        return item.formula?.number !== null && item.formula?.number !== undefined ? item.formula.number.toString() : "0";
                    }
                    if (item.type === 'title') return item.title[0]?.plain_text || "";
                    if (item.type === 'rich_text') return item.rich_text[0]?.plain_text || "";
                }
                return "0";
            }

            // Standard Notion Types
            switch (prop.type) {
                case 'title': return prop.title[0]?.plain_text || "";
                case 'rich_text': return prop.rich_text[0]?.plain_text || "";
                case 'select': return prop.select?.name || "";
                case 'status': return prop.status?.name || "";
                case 'number': return prop.number !== null && prop.number !== undefined ? prop.number.toString() : "0";
                case 'date': return prop.date?.start || "";
                case 'relation': return prop.relation.length > 0 ? "Linked" : "";
                default: return "";
            }
        };

        // Price Extraction with Fallback Chain
        let finalCost = parseNotionProp(page['Total Cost (Baht) - Final']);
        if (!finalCost || finalCost === "" || finalCost === "0") {
            finalCost = parseNotionProp(page['Total Cost (Baht)']);
        }
        if (!finalCost || finalCost === "" || finalCost === "0") {
            finalCost = parseNotionProp(page['Total Cost (Baht) - Locked']);
        }

        // M Point Values
        const mPointEarned = parseNotionProp(page['M Point Earned']);
        const pointsUsed = parseNotionProp(page['Points Used']);
        const netMPoint = parseNotionProp(page['Net M Point']);

        // Professional Clean Mapping Output
        const result = {
            'Name': parseNotionProp(page['Name']),
            'BlueBox': parseNotionProp(page['လက်ရှိအခြေအနေ']),
            'BadgeStatus': parseNotionProp(page['Status']),
            'Route': parseNotionProp(page['Route']),
            'Weight': parseNotionProp(page['Weight (kg)']),
            'Cost': finalCost,
            'ETA': parseNotionProp(page['ETA']),
            'MPointEarned': mPointEarned,
            'PointsUsed': pointsUsed,
            'NetMPoint': netMPoint
        };

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ error: "Server Error", details: error.message });
    }
}
