import { Octokit } from "https://cdn.skypack.dev/@octokit/core/dist-web"
export default class GithubCloud {
    /**
     * @param {{owner:string, repo:string, Authorization:string}} options 
     */
    constructor(options) {
        const { owner, repo, Authorization } = options;
        this.contentUrl = `/repos/${owner}/${repo}/contents/`;
        this.octokit = new Octokit({ auth: Authorization });
        this.shaMap = new Map();
    }

    async getPathInfo(path) {
        const e = await this.octokit.request(`GET ${this.contentUrl}${path}`);
        if (e.status !== 200) {
            throw `GET ${path} Error`
        }
        this.shaMap.set(path, e.data.sha);
        return e
    }

    async get(path) {
        try {
            const e = await this.getPathInfo(path);
            if (e.data.encoding === "base64") {
                return atob(e.data.content)
            }
            return e.data.content
        } catch (error) {
            return null
        }
    }

    async getJson(path) {
        const e = await this.get(path);
        try {
            return JSON.parse(e)
        } catch (error) {
            return null
        }
    }

    async put(path, content, body = {}) {
        try {
            if (this.shaMap.has(path) && !body.sha) {
                body.sha = this.shaMap.get(path)
            }
            return await this.octokit.request(`PUT ${this.contentUrl}${path}`, {
                message: `octokit put ${path}`,
                content: btoa(content),
                ...body
            })
        } catch (e) {
            let error = "";
            if (e.status === 422 && e.message.indexOf('"sha"') > -1) {
                error = "update"
            } else if (e.status === 409 && e.message.indexOf('does not match') > -1) {
                error = "sha error"
            }
            if (error) {
                Reflect.deleteProperty(body, "sha");
                await this.getPathInfo(path);
                return this.put(path, content, body)
            }
        }
    }

    putJson(path, content) {
        return this.put(path, JSON.stringify(content, null, 2))
    }
}
