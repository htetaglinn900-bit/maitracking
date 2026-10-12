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
            if (!prop) return "";
            if (prop.type === 'formula') {
                const formulaVal = prop.formula;
                return formulaVal.number?.toString() || formulaVal.string || "0";
            }
            if (prop.type === 'rollup') {
                const rollupVal = prop.rollup;
                if (rollupVal.type === 'number') return rollupVal.number?.toString() || "0";
                if (rollupVal.type === 'array') {
                    return rollupVal.array[0]?.number?.toString() || rollupVal.array[0]?.title[0]?.plain_text || "0";
                }
            }
            switch (prop.type) {
                case 'title': return prop.title[0]?.plain_text || "";
                case 'rich_text': return prop.rich_text[0]?.plain_text || "";
                case 'select': return prop.select?.name || "";
                case 'status': return prop.status?.name || "";
                case 'number': return prop.number?.toString() || "0";
                case 'date': return prop.date?.start || "";
                case 'relation': return prop.relation.length > 0 ? "Linked" : "";
                default: return "";
            }
        };

        // Price Logic
        let finalCost = getValue(page['Total Cost (Baht) - Final']);
        if (!finalCost || finalCost === "0") finalCost = getValue(page['Total Cost (Baht)']);

        // Professional Mapping (Backend) including M Point Data
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
