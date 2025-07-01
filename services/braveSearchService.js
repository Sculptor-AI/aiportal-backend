import axios from 'axios';
import cheerio from 'cheerio';

/**
 * Brave Search Service
 * Handles web search requests using Brave Search API
 */
export class BraveSearchService {
  
  static async searchWeb(query, maxResults = 3) {
    try {
      const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
      
      if (!BRAVE_API_KEY) {
        throw new Error('Brave Search API key is not configured');
      }
      
      const braveApiEndpoint = "https://api.search.brave.com/res/v1/web/search";
      const headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY
      };
      
      const params = {
        "q": query,
        "count": Math.min(maxResults, 10) // Brave API limit
      };
      
      console.log(`BraveSearchService: Searching for "${query}" with max ${maxResults} results`);
      
      const response = await axios.get(braveApiEndpoint, { 
        headers, 
        params,
        timeout: 10000 
      });
      
      const searchResultsRaw = response.data?.web?.results || [];
      const results = searchResultsRaw.slice(0, maxResults).map(item => ({
        title: item.title || 'No title',
        url: item.url,
        snippet: item.description || ''
      }));
      
      console.log(`BraveSearchService: Found ${results.length} search results`);
      return results;
      
    } catch (error) {
      console.error('BraveSearchService error:', error);
      throw new Error(`Failed to perform search: ${error.message}`);
    }
  }
  
  static async scrapeUrl(url) {
    try {
      console.log(`BraveSearchService: Scraping URL: ${url}`);
      
      // Use a browser-like user agent to avoid being blocked
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      };
      
      const response = await axios.get(url, {
        headers,
        timeout: 20000,
        maxRedirects: 5
      });
      
      const contentType = response.headers['content-type'] || '';
      console.log(`BraveSearchService: Content type for ${url}: ${contentType}`);
      
      if (!contentType.includes('html')) {
        throw new Error('URL does not contain HTML content');
      }
      
      const html = response.data;
      const $ = cheerio.load(html);
      
      // Get page title
      const pageTitle = $('title').text().trim() || 'No title';
      
      // Apply content extraction strategies
      let extractedText = this.extractContent($, url);
      
      // Clean up the text
      let cleanedContent = extractedText
        .replace(/\s+/g, ' ')  // Replace multiple whitespaces with a single space
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 5) // Keep lines with at least some content
        .join('\n');
      
      console.log(`BraveSearchService: Extracted content length: ${cleanedContent.length}`);
      
      return {
        url: response.request.res?.responseUrl || url,
        title: pageTitle,
        content: cleanedContent || 'No substantial content could be extracted',
        length: cleanedContent.length
      };
      
    } catch (error) {
      console.error(`BraveSearchService: Error scraping ${url}:`, error.message);
      throw new Error(`Failed to scrape URL: ${error.message}`);
    }
  }
  
  static extractContent($, url) {
    let extractedText = '';
    
    // Try Wikipedia-specific extraction
    if (url.includes('wikipedia.org')) {
      console.log("BraveSearchService: Using Wikipedia-specific extraction");
      const content = $('#content, #mw-content-text');
      if (content.length) {
        // Remove tables, navigation, info boxes, etc.
        content.find('table, .navigation, .infobox, .sidebar, .navbox, .vertical-navbox, .ambox').remove();
        extractedText = content.text();
      }
    }
    
    // Try for news article extraction
    if (!extractedText && ($('article').length || $('.article').length)) {
      console.log("BraveSearchService: Using news article extraction");
      const articleContent = $('article, .article, [role="article"]');
      articleContent.find('aside, [role="complementary"], .advertisement, script, style, nav').remove();
      extractedText = articleContent.text();
    }
    
    // Government website extraction
    if (!extractedText && (url.includes('.gov') || url.includes('whitehouse'))) {
      console.log("BraveSearchService: Using government website extraction");
      $('nav, header, footer, .menu, .navigation, #navigation, .sidebar, #sidebar, script, style').remove();
      
      const mainContent = $('#main-content, .main-content, main, .usa-content, .usa-section');
      if (mainContent.length) {
        extractedText = mainContent.text();
      } else {
        // Try to get paragraph content from anywhere on the page as fallback
        extractedText = $('p').map((i, el) => $(el).text().trim()).get().join('\n\n');
      }
    }
    
    // Fallback to general extraction strategies
    if (!extractedText) {
      console.log("BraveSearchService: Using general extraction fallbacks");
      
      // Remove common non-content elements first
      $('script, style, nav, header, footer, aside, iframe, [class*="ad"], [class*="sidebar"], [id*="sidebar"]').remove();
      
      // Try different content selectors in order of specificity
      const selectors = [
        'article', 
        'main',
        '[role="main"]',
        '.main', 
        '#main', 
        '.post-content', 
        '.entry-content', 
        '#content', 
        '.content',
        '.page-content',
        '.container',
        '#container'
      ];
      
      let mainContent = null;
      for (const selector of selectors) {
        mainContent = $(selector);
        if (mainContent.length) {
          console.log(`BraveSearchService: Found content using selector: ${selector}`);
          break;
        }
      }
      
      if (mainContent && mainContent.length) {
        extractedText = mainContent.text().trim();
      }
      
      // If we still don't have anything, get all paragraphs
      if (!extractedText || extractedText.length < 100) {
        console.log("BraveSearchService: Using paragraph extraction fallback");
        const paragraphs = $('p').map((i, el) => $(el).text().trim()).get();
        extractedText = paragraphs.join('\n\n');
      }
      
      // Last resort: just get the body text
      if (!extractedText || extractedText.length < 100) {
        console.log("BraveSearchService: Using body text as last resort");
        extractedText = $('body').text().trim();
      }
    }
    
    return extractedText;
  }
  
  static async searchAndScrape(query, maxResults = 2, maxContentLength = 65000) {
    try {
      console.log(`BraveSearchService: Starting search and scrape for "${query}"`);
      
      // Step 1: Search using Brave
      const searchResults = await this.searchWeb(query, 5); // Get more results to filter
      
      if (!searchResults.length) {
        throw new Error('No search results found');
      }
      
      // Step 2: Prioritize and filter results
      let filteredResults = [];
      
      // First try to find Wikipedia page - highest priority
      const wikipediaResults = searchResults.filter(result => 
        result.url.includes('wikipedia.org')
      );
      
      if (wikipediaResults.length > 0) {
        filteredResults.push(wikipediaResults[0]);
        console.log('BraveSearchService: Found Wikipedia source:', wikipediaResults[0].url);
      }
      
      // Add other authoritative sources if needed
      if (filteredResults.length < maxResults) {
        const otherResults = searchResults.filter(result => 
          !result.url.includes('wikipedia.org') && 
          (result.url.includes('.gov') || 
           result.url.includes('.edu') ||
           result.url.includes('reuters.com') ||
           result.url.includes('bbc.com') ||
           result.url.includes('cnn.com'))
        );
        
        for (const result of otherResults) {
          if (filteredResults.length >= maxResults) break;
          filteredResults.push(result);
          console.log('BraveSearchService: Added authoritative source:', result.url);
        }
      }
      
      // Fill remaining slots with any other results
      if (filteredResults.length < maxResults) {
        for (const result of searchResults) {
          if (filteredResults.length >= maxResults) break;
          if (!filteredResults.find(r => r.url === result.url)) {
            filteredResults.push(result);
            console.log('BraveSearchService: Added fallback source:', result.url);
          }
        }
      }
      
      // Cap at max results
      filteredResults = filteredResults.slice(0, maxResults);
      console.log(`BraveSearchService: Selected ${filteredResults.length} sources for scraping`);
      
      // Step 3: Scrape content from each URL
      const scrapedContents = [];
      
      for (const result of filteredResults) {
        try {
          const scrapedData = await this.scrapeUrl(result.url);
          
          // Ensure the scraped content doesn't exceed the limit
          let content = scrapedData.content;
          
          if (content.length > maxContentLength) {
            console.log(`BraveSearchService: Content too large (${content.length} chars), truncating to ${maxContentLength} chars`);
            content = content.substring(0, maxContentLength) + 
              "\n\n[Content truncated due to length constraints]";
          }
          
          scrapedContents.push({
            title: result.title,
            url: result.url,
            content: content
          });
          console.log(`BraveSearchService: Successfully scraped: ${result.url} (${content.length} chars)`);
        } catch (error) {
          console.error(`BraveSearchService: Error scraping ${result.url}:`, error);
          // Continue with other URLs even if one fails
        }
      }
      
      console.log(`BraveSearchService: Successfully scraped ${scrapedContents.length} out of ${filteredResults.length} URLs`);
      
      if (!scrapedContents.length) {
        throw new Error('Could not scrape content from any search results');
      }
      
      return {
        searchResults: filteredResults,
        scrapedContents: scrapedContents
      };
      
    } catch (error) {
      console.error('BraveSearchService: Search and scrape error:', error);
      throw error;
    }
  }
  
  static formatSearchContent(scrapedContents) {
    return scrapedContents.map(item => 
      `SOURCE: ${item.title} (${item.url})\n\n${item.content}`
    ).join('\n\n---\n\n');
  }
}