export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: "ID is required" });
    }

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
                filter: {
                    property: 'ပါဆယ် နံပါတ်', // Rich Text Property
                    rich_text: {
                        equals: id
                    }
                }
            })
        });

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return res.status(404).json({ error: "ID Not Found" });
        }

        const page = data.results[0].properties;

        // Notion Property တန်ဖိုးများကို ထုတ်ယူရန် Helper Function
        const getValue = (prop) => {
            if (!prop) return "";
            // Formula column ဖြစ်နေခဲ့ရင် value ကို formula type ထဲက ပြန်ယူရပါတယ်
    if (prop.type === 'formula') {
        const formulaVal = prop.formula;
        return formulaVal.number?.toString() || formulaVal.string || "0";
    }
            switch (prop.type) {
                case 'title': return prop.title[0]?.plain_text || "";
                case 'rich_text': return prop.rich_text[0]?.plain_text || "";
                case 'select': return prop.select?.name || "";
                case 'status': return prop.status?.name || "";
                case 'number': return prop.number?.toString() || "0";
                case 'date': return prop.date?.start || "";
                default: return "";
            }
        };

        const result = {
            'Name': getValue(page['Name']),
            'Current status': getValue(page['Current status']),
            'Route': getValue(page['Route']),
            'Current Status': getValue(page['Current Status']),
            'Weight (kg)': getValue(page['Weight (kg)']),
            'Total Cost (Baht)': getValue(page['Total Cost (Baht)']),
            'ETA': getValue(page['ETA']),
        };

        return res.status(200).json(result);

    } catch (error) {
        console.error("Notion Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
