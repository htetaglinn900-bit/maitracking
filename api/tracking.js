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
            'Customer Name': getValue(page['Customer Name']),
            'Status': getValue(page['Status']),
            'လမ်းကြောင်း': getValue(page['လမ်းကြောင်း']),
            'လက်ရှိအခြေအနေ': getValue(page['လက်ရှိအခြေအနေ']),
            'Weight (kg)': getValue(page['Weight (kg)']),
            'စုစုပေါင်းကျသင့်ငွေ (Baht)': getValue(page['စုစုပေါင်းကျသင့်ငွေ (Baht)']),
            'ခန့်မှန်း ရောက်ရှိမည့် ရက်': getValue(page['ခန့်မှန်း ရောက်ရှိမည့် ရက်']),
        };

        return res.status(200).json(result);

    } catch (error) {
        console.error("Notion Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
