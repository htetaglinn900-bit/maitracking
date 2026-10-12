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

        const getValue = (prop) => {
            if (!prop) return "0";
            if (prop.type === 'formula') {
                const f = prop.formula;
                if (f.type === 'number') return f.number !== null && f.number !== undefined ? f.number.toString() : "0";
                if (f.type === 'string') return f.string || "0";
                return "0";
            }
            if (prop.type === 'rollup') {
                const r = prop.rollup;
                if (r.type === 'number') return r.number !== null && r.number !== undefined ? r.number.toString() : "0";
                if (r.type === 'array' && r.array.length > 0) {
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

        let finalCost = getValue(page['Total Cost (Baht) - Final']);
        if (!finalCost || finalCost === "0") finalCost = getValue(page['Total Cost (Baht)']);

        const result = {
            'Name': getValue(page['Name']),
            'BlueBox': getValue(page['လက်ရှိအခြေအနေ']),
            'BadgeStatus': getValue(page['Status']),
            'Route': getValue(page['Route']),
            'Weight': getValue(page['Weight (kg)']),
            'Cost': finalCost,
            'ETA': getValue(page['ETA']),
            'MPointEarned': getValue(page['M Point Earned']),
            'PointsUsed': getValue(page['Points Used']),
            'NetMPoint': getValue(page['Net M Point'])
        };

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ error: "Server Error" });
    }
}
