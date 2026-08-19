![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-next-light.2d2j04-25g3vf.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-next-dark.0jqrwuxq05oly.svg)

Next.js (/pages)

Choose a framework to optimize documentation to:

- ![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-next-light.2d2j04-25g3vf.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-next-dark.0jqrwuxq05oly.svg)
  
  Next.js (/app)
- ![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-next-light.2d2j04-25g3vf.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-next-dark.0jqrwuxq05oly.svg)
  
  Next.js (/pages)
- ![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-svelte-color-light.42pqttoqfivm0.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-svelte-color-dark.42pqttoqfivm0.svg)
  
  SvelteKit
- ![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-react-color-light.10u6bjwutdk6d.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-react-color-dark.0essn2pwe_ukw.svg)
  
  Create React App
- ![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-nuxt-color-light.3nioj22-jeo1s.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-nuxt-color-dark.3nioj22-jeo1s.svg)
  
  Nuxt
- ![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-vue-color-light.28rqi6mhab6oy.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-vue-color-dark.28rqi6mhab6oy.svg)
  
  Vue
- ![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-remix-color-light.2g_ojwpjmhwhw.svg)![](/vc-ap-vercel-docs/_next/static/immutable/media/logo-remix-color-dark.3b3a2cdq0dvgg.svg)
  
  Remix
- Astro
- HTML5
  
  HTML
- Other frameworks

On this page

# Getting started with Vercel Web Analytics

This guide will help you get started with using Vercel Web Analytics on your project, showing you how to enable it, add the package to your project, deploy your app to Vercel, and view your data in the dashboard.

Select your framework to view instructions on using the Vercel Web Analytics in your project.

AI Assistance

Help me add Vercel Web Analytics to this project. First, make sure the Vercel CLI is installed (\`npm i -g vercel\`). If I'm using Claude Code or Cursor, install the Vercel Plugin (\`npx plugins add vercel/vercel-plugin\`). For other agents, install Vercel Skills (\`npx skills add vercel-labs/agent-skills\`). Then: 1. Install @vercel/analytics. 2. Add the Analytics component to my root layout. 3. Deploy with \`vercel --prod\` and verify analytics data appears in the Vercel dashboard.

Show less

## Prerequisites

- A Vercel account. If you don't have one, you can [sign up for free](https://vercel.com/signup).
- A Vercel project. If you don't have one, you can [create a new project](https://vercel.com/new).
- The Vercel CLI installed. If you don't have it, you can install it using the following command:

pnpmyarnnpmbun

Terminal

```
pnpm i -g vercel
```

Terminal

```
yarn global add vercel
```

Terminal

```
npm i -g vercel
```

Terminal

```
bun add -g vercel
```

Version 2 package updates are available. For details, see [What's new in version 2](/docs/analytics/package#what's-new-in-version-2.x).

## Set up your project

1. ### Enable Web Analytics in Vercel
   
   On the Vercel dashboard, navigate to Analytics in the sidebar and select a project. Or select the button below to go there.
   
   [Go to Web Analytics](/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fanalytics&title=Open+Web+Analytics)
   
   Then click the Enable button in the header.
   
   Enabling Web Analytics will add new routes (scoped at `/_vercel/insights/*` and `/<unique-path>/*`) after your next deployment.
   
2. ### Add @vercel/analytics to your project
   
   Using the package manager of your choice, add the `@vercel/analytics` package to your project:
   
   pnpmyarnnpmbun
   
   Terminal
   
   ```
   pnpm i @vercel/analytics
   ```
   
   Terminal
   
   ```
   yarn add @vercel/analytics
   ```
   
   Terminal
   
   ```
   npm i @vercel/analytics
   ```
   
   Terminal
   
   ```
   bun add @vercel/analytics
   ```
   
3. ### Add the Analytics component to your app
   
   The `Analytics` component is a wrapper around the tracking script, offering more seamless integration with Next.js, including route support.
   
   If you are using the `pages` directory, add the following code to your main app file:
   
   pages/\_app.tsx
   
   Next.js (/pages)
   
   Next.js (/app)Next.js (/pages)SvelteKitCreate React AppNuxtVueRemixAstroHTMLOther frameworks
   
   TypeScript
   
   TypeScriptJavaScriptBash
   
   ```
   import type { AppProps } from 'next/app';
   import { Analytics } from '@vercel/analytics/next';
    
   function MyApp({ Component, pageProps }: AppProps) {
     return (
       <>
         <Component {...pageProps} />
         <Analytics />
       </>
     );
   }
    
   export default MyApp;
   ```
   
4. ### Deploy your app to Vercel
   
   Deploy your app using the following command:
   
   terminal
   
   ```
   vercel deploy
   ```
   
   If you haven't already, we also recommend [connecting your project's Git repository](/docs/git#deploying-a-git-repository), which will enable Vercel to deploy your latest commits to main without terminal commands.
   
   Once your app is deployed, it will start tracking visitors and page views.
   
   If everything is set up properly, you should be able to see a Fetch/XHR request in your browser's Network tab from `/<unique-path>/view` when you visit any page.
   
5. ### View your data in the dashboard
   
   Once your app is deployed, and users have visited your site, you can view your data in the dashboard.
   
   To do so, go to your [dashboard](/dashboard), select your project, and click [Analytics](https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fanalytics&title=Go+to+Analytics) in the sidebar.
   
   After a few days of visitors, you'll be able to start exploring your data by viewing and [filtering](/docs/analytics/filtering) the panels.
   
   Users on Pro and Enterprise plans can also add [custom events](/docs/analytics/custom-events) to their data to track user interactions such as button clicks, form submissions, or purchases.
   

Learn more about how Vercel supports [privacy and data compliance standards](/docs/analytics/privacy-policy) with Vercel Web Analytics.

## Next steps

Now that you have Vercel Web Analytics set up, you can explore the following topics to learn more:

- [Explore your analytics dashboard](/docs/analytics/using-web-analytics)
- [Learn how to set up custom events](/docs/analytics/custom-events)
- [Learn how to redact sensitive data](/docs/analytics/redacting-sensitive-data)
- [Read about privacy and compliance](/docs/analytics/privacy-policy)
- [Learn how to configure your client-side package](/docs/analytics/package)
- [Explore pricing](/docs/analytics/limits-and-pricing)
- [Troubleshooting](/docs/analytics/troubleshooting)

Related Vercel documentation

## Cross-link map: Getting Started (/docs/analytics/quickstart)

> From the Vercel docs graph (built 2026-08-19T05:24:32.353Z), spanning vercel.com docs + KB, nextjs.org, ai-sdk.dev, and other Vercel documentation sites. Full graph as JSON: [https://vercel.com/docs/graph.json](https://vercel.com/docs/graph.json)

### Semantically closest pages

- [Getting Started](https://vercel.com/docs/speed-insights/quickstart?from=graph) — Vercel Speed Insights provides you detailed insights into your website's performance. This quickstart guide will help yo
- [Using Web Analytics](https://vercel.com/docs/analytics/using-web-analytics?from=graph) — Learn how to use Vercel's Web Analytics to understand how visitors are using your website.
- [Troubleshooting](https://vercel.com/docs/analytics/troubleshooting?from=graph) — Learn how to troubleshoot common issues with Vercel Web Analytics.
- [Create React App](https://vercel.com/docs/frameworks/frontend/create-react-app?from=graph) — Learn how to use Vercel's features with Create React App
- [Web Analytics](https://vercel.com/docs/analytics?from=graph) — With Web Analytics, you can get detailed insights into your website's visitors with new metrics like top pages, top refe

### Prerequisites

- [Web Analytics](https://vercel.com/docs/analytics?from=graph) — With Web Analytics, you can get detailed insights into your website's visitors with new metrics like top pages, top refe

### This page links to (9)

- [Custom Events](https://vercel.com/docs/analytics/custom-events?from=graph) — Learn how to send custom analytics events from your application.
- [Filtering](https://vercel.com/docs/analytics/filtering?from=graph) — Learn how filters allow you to explore insights about your website's visitors.
- [Pricing](https://vercel.com/docs/analytics/limits-and-pricing?from=graph) — Learn about pricing for Vercel Web Analytics.
- [@vercel/analytics](https://vercel.com/docs/analytics/package?from=graph) — With the @vercel/analytics npm package, you are able to configure your application to send analytics data to Vercel.
- [Privacy](https://vercel.com/docs/analytics/privacy-policy?from=graph) — Learn how Vercel supports privacy and data compliance standards with Vercel Web Analytics.
- [Redacting Sensitive Data](https://vercel.com/docs/analytics/redacting-sensitive-data?from=graph) — Learn how to redact sensitive data from your Web Analytics events.
- [Troubleshooting](https://vercel.com/docs/analytics/troubleshooting?from=graph) — Learn how to troubleshoot common issues with Vercel Web Analytics.
- [Using Web Analytics](https://vercel.com/docs/analytics/using-web-analytics?from=graph) — Learn how to use Vercel's Web Analytics to understand how visitors are using your website.
- [Git Integrations](https://vercel.com/docs/git?from=graph) — Vercel allows for automatic deployments on every branch push and merges onto the production branch of your GitHub, GitLa

### Pages that link here (10)

By site: vercel-docs (10)

- [Web Analytics](https://vercel.com/docs/analytics?from=graph) — With Web Analytics, you can get detailed insights into your website's visitors with new metrics like top pages, top refe
- [Custom Events](https://vercel.com/docs/analytics/custom-events?from=graph) — Learn how to send custom analytics events from your application.
- [Filtering](https://vercel.com/docs/analytics/filtering?from=graph) — Learn how filters allow you to explore insights about your website's visitors.
- [@vercel/analytics](https://vercel.com/docs/analytics/package?from=graph) — With the @vercel/analytics npm package, you are able to configure your application to send analytics data to Vercel.
- [Privacy](https://vercel.com/docs/analytics/privacy-policy?from=graph) — Learn how Vercel supports privacy and data compliance standards with Vercel Web Analytics.
- [Troubleshooting](https://vercel.com/docs/analytics/troubleshooting?from=graph) — Learn how to troubleshoot common issues with Vercel Web Analytics.
- [Web Analytics API](https://vercel.com/docs/analytics/web-analytics-api?from=graph) — Learn how Web Analytics concepts map to API queries for custom reports, dashboards, and insights.
- [Managing Deployments](https://vercel.com/docs/deployments/managing-deployments?from=graph) — Learn how to manage your current and previously deployed projects to Vercel through the dashboard. You can redeploy at a
- [Astro](https://vercel.com/docs/frameworks/frontend/astro?from=graph) — Learn how to use Vercel's features with Astro
- [Create React App](https://vercel.com/docs/frameworks/frontend/create-react-app?from=graph) — Learn how to use Vercel's features with Create React App