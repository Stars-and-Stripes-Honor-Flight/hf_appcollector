exports.helloWorld = async function helloWorld(req, res) {
    var uri = req.body.cburi;
    var usr = req.body.cbusr;
    var pwd = req.body.cbpwd;

    delete req.body.cburi;
    delete req.body.cbusr;
    delete req.body.cbpwd;
    delete req.body.full_message;

    var credentials = Buffer.from(usr + ":" + pwd).toString("base64");

    try {
        var response = await fetch(uri, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: "Basic " + credentials
            },
            body: JSON.stringify(req.body)
        });

        var responseBody = await response.text();

        if (response.ok) {
            console.log(responseBody);
            res.status(200).send(req.body);
            return;
        }

        console.error("CouchDB returned error", response.status, response.statusText, responseBody);
        res.status(502).send("Failed to write application");
    } catch (error) {
        console.error("CouchDB request failed", error);
        res.status(502).send("Failed to write application");
    }
};
