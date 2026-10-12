export default async function handler(req, res) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const TRACKING_DB_ID = process.env.NOTION_DATABASE_ID;
    const CUSTOMER_DB_ID = process.env.NOTION_CUSTOMER_DATABASE_ID || process.env.NOTION_DATABASE_ID;

    try {
        // Step 1: Query Order from Tracking DB
        const trackingRes = await fetch(`https://api.notion.com/v1/databases/${TRACKING_DB_ID}/query`, {
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

        const trackingData = await trackingRes.json();
        if (!trackingData.results || trackingData.results.length === 0) {
            return res.status(404).json({ error: "ID Not Found" });
        }

        const page = trackingData.results[0].properties;

        // Accurate Property Parser
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
                    if (item.type === 'formula' && item.formula?.type === 'number') return item.formula.number?.toString() || "0";
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

        const customerName = parseProp(page['Name']);
        const weightNum = parseFloat(parseProp(page['Weight (kg)']) || "0");

        // Price Extraction with Robust Priority Fallback
        let costVal = parseFloat(parseProp(page['Total Cost (Baht) - Final']));
        if (!costVal || costVal === 0) costVal = parseFloat(parseProp(page['Total Cost (Baht)']));
        if (!costVal || costVal === 0) costVal = parseFloat(parseProp(page['Total Cost (Baht) - Locked']));

        const finalCostStr = costVal.toString();

        // Check B2B Profile Link
        const profileRelation = page['MAI CARGO - B2B Customer Profiles'];
        const isB2B = profileRelation && profileRelation.relation && profileRelation.relation.length > 0;

        // Direct Fail-Safe M Point Calculation Logic (Cost / 100)
        let calculatedEarned = 0;
        if (isB2B || weightNum >= 50) {
            calculatedEarned = Math.floor(costVal / 100);
        }

        // Try reading Notion formula value, fallback to calculated if zero
        let mPointEarned = parseFloat(parseProp(page['M Point Earned']) || "0");
        if (mPointEarned === 0 && calculatedEarned > 0) {
            mPointEarned = calculatedEarned;
        }

        const pointsUsed = parseProp(page['Points Used']);

        // Step 2: Fetch Direct Customer Total Balance from B2B Profile Database
        let customerTotalBalance = "0";

        if (customerName && CUSTOMER_DB_ID) {
            try {
                const profileRes = await fetch(`https://api.notion.com/v1/databases/${CUSTOMER_DB_ID}/query`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${NOTION_TOKEN}`,
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filter: {
                            or: [
                                { property: 'Customer Name', title: { equals: customerName } },
                                { property: 'Customer Name', rich_text: { equals: customerName } }
                            ]
                        }
                    })
                });

                const profileData = await profileRes.json();
                if (profileData.results && profileData.results.length > 0) {
                    const custProps = profileData.results[0].properties;
                    customerTotalBalance = parseProp(custProps['Current Balance']);
                }
            } catch (pErr) {
                console.error("Profile DB Error:", pErr);
            }
        }

        const result = {
            'Name': customerName,
            'BlueBox': parseProp(page['လက်ရှိအခြေအနေ']),
            'BadgeStatus': parseProp(page['Status']),
            'Route': parseProp(page['Route']),
            'Weight': weightNum.toString(),
            'Cost': finalCostStr,
            'ETA': parseProp(page['ETA']),
            'MPointEarned': mPointEarned.toString(),
            'PointsUsed': pointsUsed,
            'CustomerTotalBalance': customerTotalBalance,
            'HasB2B': isB2B
        };

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ error: "Server Error" });
    }
}
