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
    metaDescription?: string;
    heroImageUrl?: string;
    heroImageAlt?: string;
    keywords?: string[];
    publishedAt?: string;
    updatedAt?: string;
}

/**
 * Next.js-compatible metadata object returned by buildArticleMetadata.
 * Pass this directly as the return value of generateMetadata() in your page.
 */
export interface ArticleMetadata {
    title: string;
    description: string;
    keywords?: string[];
    openGraph: {
        title: string;
        description: string;
        url: string;
        type: "article";
        images: Array<{ url: string; width: number; height: number; alt: string }>;
        publishedTime?: string;
        modifiedTime?: string;
    };
    twitter: {
        card: "summary_large_image";
        title: string;
        description: string;
        images: string[];
    };
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
        const fields = (doc as { fields?: Record<string, { stringValue?: string; arrayValue?: { values?: Array<{ stringValue?: string }> } }> }).fields ?? {};
        const str = (key: string) => fields[key]?.stringValue ?? "";
        const optStr = (key: string) => fields[key]?.stringValue || undefined;
        const strArray = (key: string): string[] | undefined => {
            const arr = fields[key]?.arrayValue?.values;
            if (!arr) return undefined;
            return arr.map((v) => v.stringValue ?? "").filter(Boolean);
        };
        return {
            slug: str("slug"),
            title: str("title"),
            excerpt: str("excerpt"),
            content: str("content"),
            category: str("category"),
            readTime: str("readTime"),
            gradient: str("gradient") || "from-blue-600 to-cyan-500",
            featuredImage: fields["featuredImage"]?.stringValue,
            metaDescription: optStr("metaDescription"),
            heroImageUrl: optStr("heroImageUrl"),
            heroImageAlt: optStr("heroImageAlt"),
            keywords: strArray("keywords"),
            publishedAt: optStr("publishedAt"),
            updatedAt: optStr("updatedAt"),
        };
    }

    /**
     * Fetch all published blog posts for this site from the blog center Firestore,
     * ordered by publishedAt descending.
     * Collection: {siteId}_articles
     */
    async getPosts(siteId?: string): Promise<BlogPost[]> {
        const site = siteId ?? this.siteId;
        const { projectId } = this.config;
        if (!projectId) throw new Error("EchoseoBlog: projectId is required.");
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${this.apiKey}`;

        const body = {
            structuredQuery: {
                from: [{ collectionId: `${site}_articles` }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "status" },
                        op: "EQUAL",
                        value: { stringValue: "published" },
                    },
                },
                orderBy: [
                    {
                        field: { fieldPath: "publishedAt" },
                        direction: "DESCENDING",
                    },
                ],
            },
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            // Disable Next.js caching so we always get fresh data (ISR handles the cache layer)
            cache: "no-store",
        });

        if (!res.ok) {
            throw new Error(`EchoseoBlog getPosts failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as Array<{ document?: Record<string, unknown> }>;
        return json
            .filter((entry) => entry.document)
            .map((entry) => this.parseDoc(entry.document!));
    }

    /**
     * Fetch a single published blog post by slug.
     * Document path: {siteId}_articles/{slug}
     */
    async getPost(slug: string, siteId?: string): Promise<BlogPost | null> {
        const site = siteId ?? this.siteId;
        const url = `${this.baseUrl}/${site}_articles/${slug}?key=${this.apiKey}`;

        const res = await fetch(url, { cache: "no-store" });

        if (res.status === 404) return null;
        if (!res.ok) {
            throw new Error(`EchoseoBlog getPost failed: ${res.status} ${res.statusText}`);
        }

        const doc = (await res.json()) as Record<string, unknown>;
        const fields = (doc as { fields?: Record<string, { stringValue?: string }> }).fields;
        if (fields?.status?.stringValue !== "published") return null;
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

/**
 * Build a Next.js-compatible Metadata object from a BlogPost.
 * Use as the return value of generateMetadata() in your article page.
 *
 * @example
 * ```ts
 * // app/blog/[slug]/page.tsx
 * import { getEchoseoClient, buildArticleMetadata } from "echoseo-blog-sdk";
 *
 * export async function generateMetadata({ params }) {
 *   const post = await getEchoseoClient().getPost(params.slug);
 *   if (!post) return {};
 *   return buildArticleMetadata(post, "https://echoops.org/blog");
 * }
 * ```
 */
export function buildArticleMetadata(post: BlogPost, baseUrl: string): ArticleMetadata {
    const url = `${baseUrl.replace(/\/$/, "")}/${post.slug}`;
    const description = post.metaDescription || post.excerpt || "";
    const imageUrl = post.heroImageUrl || post.featuredImage;
    const imageAlt = post.heroImageAlt || post.title;

    return {
        title: post.title,
        description,
        keywords: post.keywords,
        openGraph: {
            title: post.title,
            description,
            url,
            type: "article",
            images: imageUrl
                ? [{ url: imageUrl, width: 1200, height: 630, alt: imageAlt }]
                : [],
            publishedTime: post.publishedAt,
            modifiedTime: post.updatedAt,
        },
        twitter: {
            card: "summary_large_image",
            title: post.title,
            description,
            images: imageUrl ? [imageUrl] : [],
        },
    };
}
