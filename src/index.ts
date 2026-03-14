export interface EchoseoBlogConfig {
    apiKey?: string;
    projectId?: string;
    consumerToken?: string;
    siteId?: string;
}

export interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    category: string;
    readTime: string;
    gradient: string;
    featuredImage?: string;
}

export class EchoseoBlogClient {
    private config: EchoseoBlogConfig;

    constructor(config: EchoseoBlogConfig) {
        this.config = config;
    }

    private get baseUrl(): string {
        const { projectId } = this.config;
        if (!projectId) throw new Error("EchoseoBlog: projectId is required.");
        return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    }

    private get apiKey(): string {
        if (!this.config.apiKey) throw new Error("EchoseoBlog: apiKey is required.");
        return this.config.apiKey;
    }

    private get siteId(): string {
        return this.config.siteId ?? "default";
    }

    /** Convert a Firestore REST document into a plain BlogPost object */
    private parseDoc(doc: Record<string, unknown>): BlogPost {
        const fields = (doc as { fields?: Record<string, { stringValue?: string }> }).fields ?? {};
        const str = (key: string) => fields[key]?.stringValue ?? "";
        return {
            slug: str("slug"),
            title: str("title"),
            excerpt: str("excerpt"),
            content: str("content"),
            category: str("category"),
            readTime: str("readTime"),
            gradient: str("gradient") || "from-blue-600 to-cyan-500",
            featuredImage: fields["featuredImage"]?.stringValue,
        };
    }

    /**
     * Fetch all blog posts for this site from the blog center Firestore.
     * Collection path: sites/{siteId}/articles
     */
    async getPosts(siteId?: string): Promise<BlogPost[]> {
        const site = siteId ?? this.siteId;
        const url = `${this.baseUrl}/sites/${site}/articles?key=${this.apiKey}`;

        const res = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            // Disable Next.js caching so we always get fresh data (ISR handles the cache layer)
            cache: "no-store",
        });

        if (!res.ok) {
            throw new Error(`EchoseoBlog getPosts failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as { documents?: Record<string, unknown>[] };
        const docs = json.documents ?? [];
        return docs.map((doc) => this.parseDoc(doc));
    }

    /**
     * Fetch a single blog post by slug.
     * Document path: sites/{siteId}/articles/{slug}
     */
    async getPost(slug: string, siteId?: string): Promise<BlogPost | null> {
        const site = siteId ?? this.siteId;
        const url = `${this.baseUrl}/sites/${site}/articles/${slug}?key=${this.apiKey}`;

        const res = await fetch(url, { cache: "no-store" });

        if (res.status === 404) return null;
        if (!res.ok) {
            throw new Error(`EchoseoBlog getPost failed: ${res.status} ${res.statusText}`);
        }

        const doc = (await res.json()) as Record<string, unknown>;
        return this.parseDoc(doc);
    }
}

let defaultClient: EchoseoBlogClient | null = null;

/**
 * Initialize the Echoseo Blog SDK.
 * Missing configuration values fall back to environment variables.
 */
export const initEchoseoBlog = (config: EchoseoBlogConfig): EchoseoBlogClient => {
    const resolvedConfig: EchoseoBlogConfig = {
        apiKey: config.apiKey ?? process.env.ECHOSEO_BLOG_API_KEY ?? process.env.ECHOSEO_BLOG_SDK_API_KEY,
        projectId: config.projectId ?? process.env.ECHOSEO_BLOG_PROJECT_ID ?? process.env.ECHOSEO_BLOG_SDK_PROJECT_ID,
        consumerToken: config.consumerToken ?? process.env.ECHOSEO_BLOG_CONSUMER_TOKEN ?? process.env.ECHOSEO_BLOG_SDK_KEY,
        siteId: config.siteId ?? process.env.ECHOSEO_BLOG_SITE_ID ?? process.env.ECHOSEO_BLOG_SDK_SITE_ID,
    };

    const missing = (["apiKey", "projectId", "consumerToken", "siteId"] as const).filter(
        (k) => !resolvedConfig[k]
    );
    if (missing.length > 0) {
        console.warn(`EchoseoBlog: missing config values: ${missing.join(", ")}`);
    }

    defaultClient = new EchoseoBlogClient(resolvedConfig);
    return defaultClient;
};

/**
 * Retrieve the initialized Echoseo Blog Client instance.
 */
export const getEchoseoClient = (): EchoseoBlogClient => {
    if (!defaultClient) {
        throw new Error("Echoseo Blog SDK is not initialized. Call initEchoseoBlog first.");
    }
    return defaultClient;
};
