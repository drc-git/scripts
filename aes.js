export async function aesEncrypt(plaintext) {
    const { key, exportKey } = await generateAesKey();
    const iv = crypto.getRandomValues(new Uint8Array(16));

    const ciphertext = await crypto.subtle.encrypt({
        name: 'AES-CBC',
        iv,
    }, key, new TextEncoder().encode(plaintext));

    return {
        key: exportKey,
        ciphertext: btoa(JSON.stringify([
            uint8ArrayToString(iv),
            arrayBufferToString(ciphertext)
        ]))
    }
}

export async function aesDecrypt(ciphertext, key) {
    key = await importKey(key)
    const [iv, text] = JSON.parse(atob(ciphertext))
    const data = await crypto.subtle.decrypt(
        {
            name: "AES-CBC",
            iv: stringToUnit8Array(iv), //The initialization vector you used to encrypt
        },
        key, //from generateKey or importKey above
        stringToUnit8Array(text).buffer //ArrayBuffer of the data
    )
    return arrayBufferToString(data)
}

export async function aesDecryptUrlKey(ciphertext) {
    let key = location.search.slice(1);
    if (!key) {
        key = sessionStorage.getItem('aes.key')
    }
    if (!key) {
        key = prompt("请输入 key")
    }
    if (!key) {
        return Promise.reject("请输入 key")
    }
    sessionStorage.setItem('aes.key', key);
    return aesDecrypt(ciphertext, key)
}

async function generateAesKey(length = 256) {
    const key = await crypto.subtle.generateKey(
        {
            name: "AES-CBC",
            length: 256, //can be  128, 192, or 256
        },
        true, //whether the key is extractable (i.e. can be used in exportKey)
        ["encrypt", "decrypt"] //can be "encrypt", "decrypt", "wrapKey", or "unwrapKey"
    )
    const exportKey = await crypto.subtle.exportKey(
        "jwk", //can be "jwk" or "raw"
        key //extractable must be true
    )
    return {
        key,
        exportKey: exportKey.k
    }
}

async function importKey(keyString) {
    return crypto.subtle.importKey(
        "jwk", //can be "jwk" or "raw"
        {   //this is an example jwk key, "raw" would be an ArrayBuffer
            kty: "oct",
            k: keyString,
            alg: "A256CBC",
            ext: true,
        },
        {   //this is the algorithm options
            name: "AES-CBC",
        },
        false, //whether the key is extractable (i.e. can be used in exportKey)
        ["encrypt", "decrypt"] //can be "encrypt", "decrypt", "wrapKey", or "unwrapKey"
    )
}

function stringToUnit8Array(str) {
    const arr = [];
    for (let i = 0, j = str.length; i < j; ++i) {
        arr.push(str.charCodeAt(i))
    }
    return new Uint8Array(arr)
}

function uint8ArrayToString(uint8Array) {
    return String.fromCharCode.apply(null, uint8Array)
}

function arrayBufferToString(ab) {
    return uint8ArrayToString(new Uint8Array(ab))
}