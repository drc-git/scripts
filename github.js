import { Octokit } from "https://cdn.skypack.dev/@octokit/core/dist-web"

export default class GithubCloud {
    #rawUrl
    #contentUrl
    #shaMap
    /**
     * branch default 'main', private default false, sign default 'Octokit'
     * @param {{owner:string, repo:string, Authorization:string,branch:String,private:Boolean,sign:String}} options 
     */
    constructor(options) {
        const { owner, repo, Authorization, 'private': _private, branch, sign } = Object.assign({ branch: 'main', sign: 'Octokit', private: false }, options);
        this.#contentUrl = `/repos/${parseEncodeURIComponent(`${owner}/${repo}`)}/contents/`;
        this.octokit = new Octokit({ auth: Authorization });
        if (!_private) {
            this.#rawUrl = `https://raw.githubusercontent.com/${parseEncodeURIComponent(`${owner}/${repo}/${branch}`)}/`
        }
        this.octokit.hook.before("request", async function (options) {
            if (!options.branch) {
                if (options.method === "GET") {
                    options.ref = branch
                } else {
                    options.branch = branch
                }
            }
            if (options.message) {
                options.message = sign + " " + options.message
            }
        });
        this.#shaMap = new Map()
    }

    /**
     * 获取文件信息
     * @param {*} path 
     * @returns 
     */
    async #getPathInfo(path) {
        const e = await this.octokit.request(`GET ${this.#contentUrl}${parseEncodeURIComponent(path)}`);
        if (e.status !== 200) {
            throw `GET ${path} Error`
        }
        this.#shaMap.set(path, e.data.sha);
        return e
    }

    /**
     * 公开库，通过 raw 地址 fetch GET 获取内容
     * @param {String} filename 
     * @param {'blob'|'text'|'json'} type 
     * @returns 
     */
    async #getFileRaw(filename, type = 'blob') {
        return fetch(`${this.#rawUrl}${parseEncodeURIComponent(filename)}`).then(e => {
            return e[type]()
        })
    }

    /**
     * 创建或修改内容
     * @param {*} path 
     * @param {*} base64 
     * @param {*} body 
     * @returns 
     */
    async #putBase64(path, base64, body = {}) {
        try {
            if (this.#shaMap.has(path) && !body.sha) {
                body.sha = this.#shaMap.get(path)
            }
            return await this.octokit.request(`PUT ${this.#contentUrl}${parseEncodeURIComponent(path)}`, {
                message: `${body.sha ? 'update' : 'add'} ${path}`,
                content: base64,
                ...body
            })
        } catch (e) {
            if (is_sha_error(error)) {
                Reflect.deleteProperty(body, "sha");
                await this.#getPathInfo(path);
                return this.#putBase64(path, base64, body)
            }
        }
    }

    /**
     * 获取文本信息
     * @param {*} path 
     * @returns 
     */
    async getText(path) {
        try {
            if (this.#rawUrl) {
                return await this.#getFileRaw(path, 'text')
            }
            const e = await this.#getPathInfo(path);
            if (e.data.encoding === "base64") {
                return atob(e.data.content)
            }
            return e.data.content
        } catch (error) {
            return null
        }
    }

    /**
     * 获取 json 信息
     * @param {*} path 
     * @returns 
     */
    async getJson(path) {
        const e = await this.getText(path);
        try {
            return JSON.parse(e)
        } catch (error) {
            return null
        }
    }

    /**
     * 获取文件 blob
     * @param {*} path 
     * @returns 
     */
    async getFile(path) {
        try {
            if (this.#rawUrl) {
                return await this.#getFileRaw(path, 'blob');
            }
            const e = await this.#getPathInfo(path);
            return base64ToFile(e.data.content, e.data.name)
        } catch (error) {
            return null
        }
    }

    /**
     * 创建或修改文本
     * @param {*} path 
     * @param {*} content 
     * @param  {...any} args 
     * @returns 
     */
    putText(path, content, ...args) {
        return this.#putBase64(path, btoa(content), ...args)
    }

    /**
     * 创建或修改 json
     * @param {*} path 
     * @param {*} content 
     * @param  {...any} args 
     * @returns 
     */
    putJson(path, content, ...args) {
        return this.putText(path, JSON.stringify(content, null, 2), ...args)
    }

    /**
     * 上传文件
     * @param {*} path 
     * @param {*} file 
     * @param  {...any} args 
     * @returns 
     */
    async putFile(path, file, ...args) {
        return this.#putBase64(path, await fileToBase64(file), ...args)
    }

    /**
     * 删除文件
     * @param {*} path 
     * @param {*} body 
     * @returns 
     */
    async remove(path, body = {}) {
        try {
            if (this.#shaMap.has(path) && !body.sha) {
                body.sha = this.#shaMap.get(path)
            }
            return await this.octokit.request(`DELETE ${this.#contentUrl}${parseEncodeURIComponent(path)}`, {
                message: `remove ${path}`,
                ...body
            })
        } catch (error) {
            if (is_sha_error(error)) {
                Reflect.deleteProperty(body, "sha");
                await this.#getPathInfo(path);
                return this.remove(path, body)
            }
        }
    }
}

/**
 * 是否 sha 错误
 * @param {*} error 
 * @returns 
 */
function is_sha_error(error) {
    return error.status === 422 && error.message.indexOf('"sha"') > -1 ||
        error.status === 409 && error.message.indexOf('does not match') > -1
}

/**
 * path 转换位 url path
 * @param {*} path 
 * @returns 
 */
function parseEncodeURIComponent(path) {
    return path.split('/').map(e => encodeURIComponent(e)).join('/')
}

/**
 * 读取文件 base64 内容
 * @param {*} file 
 * @returns 
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
            const dot = reader.result.indexOf(',');
            resolve(dot > -1 ? reader.result.slice(dot + 1) : reader.result)
        }
        reader.onabort = reader.onerror = reject
    })
}

/**
 * base64 转为 Blob
 * @param {*} base64 
 * @param {*} filename 
 * @returns 
 */
function base64ToFile(base64, filename) {
    const bstr = atob(base64);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
    }
    return new File([u8arr], filename)
}