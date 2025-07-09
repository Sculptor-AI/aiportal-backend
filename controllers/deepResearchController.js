import geminiService from '../services/geminiService.js';

/**
 * Deep Research API Controller
 * Handles multi-agent research queries with progress streaming
 */

/**
 * Process a deep research request with multi-agent coordination
 */
export const processDeepResearch = async (req, res) => {
  try {
    const { query, model, maxAgents = 8 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }
    
    // Validate max agents
    const agentCount = Math.min(Math.max(maxAgents, 2), 12);
    
    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
    
    // Send initial progress
    res.write(`data: ${JSON.stringify({ type: 'progress', message: 'Initializing deep research...', progress: 0 })}\n\n`);
    
    try {
      // Step 1: Task decomposition by main model
      res.write(`data: ${JSON.stringify({ type: 'progress', message: 'Breaking down research query into sub-questions...', progress: 10 })}\n\n`);
      
      const taskPrompt = `You are a research coordinator. Break down this research query into 2-${agentCount} specific, focused sub-questions that can be researched independently. Each sub-question should be actionable and specific.

Research Query: "${query}"

Respond with a JSON object containing:
{
  "subQuestions": [
    "specific sub-question 1",
    "specific sub-question 2",
    ...
  ],
  "researchApproach": "brief description of the overall approach"
}

Ensure the JSON is valid and the sub-questions are diverse and comprehensive to fully answer the main query.`;
      
      const taskResponse = await geminiService.processGeminiChat(model, taskPrompt);
      let subQuestions = [];
      let researchApproach = '';
      
      try {
        const taskResult = JSON.parse(taskResponse.choices[0].message.content);
        subQuestions = taskResult.subQuestions || [];
        researchApproach = taskResult.researchApproach || '';
      } catch (parseError) {
        console.error('Error parsing task decomposition:', parseError);
        // Fallback: create basic sub-questions
        subQuestions = [
          `What is the current state of: ${query}?`,
          `What are the latest developments regarding: ${query}?`,
          `What are the key challenges and opportunities related to: ${query}?`
        ];
        researchApproach = 'Multi-perspective research approach';
      }
      
      // Limit sub-questions to max agents
      subQuestions = subQuestions.slice(0, agentCount);
      
      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        message: `Generated ${subQuestions.length} research sub-questions. Starting parallel research...`, 
        progress: 25 
      })}\n\n`);
      
      // Step 2: Parallel research with Gemini 2.5 Flash + Google Search
      const researchPromises = subQuestions.map(async (subQuestion, index) => {
        const agentPrompt = `You are a research specialist. Conduct thorough research on this specific question using current web information. Provide a comprehensive, well-structured response with key findings and insights.

Research Question: "${subQuestion}"

Provide a detailed response that includes:
- Key findings and current information
- Important statistics or data points
- Relevant context and background
- Sources and evidence for your claims

Be thorough but focused on this specific sub-question.`;
        
        try {
          const agentResult = await geminiService.processGroundedSearch('google/gemini-2.5-flash', agentPrompt);
          return {
            subQuestion,
            response: agentResult.choices[0].message.content,
            groundingMetadata: agentResult.groundingMetadata,
            agentId: index + 1
          };
        } catch (error) {
          console.error(`Error in agent ${index + 1}:`, error);
          return {
            subQuestion,
            response: `Error conducting research for this sub-question: ${error.message}`,
            groundingMetadata: null,
            agentId: index + 1,
            error: true
          };
        }
      });
      
      // Process agents in parallel but update progress as they complete
      const agentResults = [];
      let completedAgents = 0;
      
      for (const promise of researchPromises) {
        const result = await promise;
        agentResults.push(result);
        completedAgents++;
        
        const progressPercent = 25 + (completedAgents / subQuestions.length) * 50;
        res.write(`data: ${JSON.stringify({ 
          type: 'progress', 
          message: `Agent ${completedAgents}/${subQuestions.length} completed research`, 
          progress: progressPercent 
        })}\n\n`);
      }
      
      // Step 3: Synthesis by main model
      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        message: 'Synthesizing research findings into final report...', 
        progress: 80 
      })}\n\n`);
      
      const synthesisPrompt = `You are a research synthesizer. Based on the research conducted by multiple agents, create a comprehensive final report that answers the original query.

Original Query: "${query}"

Research Approach: ${researchApproach}

Agent Research Results:
${agentResults.map(result => `
Agent ${result.agentId} - Sub-question: "${result.subQuestion}"
Research Findings:
${result.response}
${result.error ? '[Note: This agent encountered an error]' : ''}
---
`).join('\n')}

Create a comprehensive final report that:
1. Directly answers the original query
2. Synthesizes findings from all agents
3. Identifies key themes and patterns
4. Provides actionable insights
5. Highlights any conflicting information or gaps
6. Concludes with a clear summary

Structure your response as a well-organized report with clear sections and headers.`;
      
      const finalResponse = await geminiService.processGeminiChat(model, synthesisPrompt);
      
      // Collect all sources from grounding metadata
      const allSources = [];
      const sourceMap = new Map();
      
      agentResults.forEach(result => {
        if (result.groundingMetadata && result.groundingMetadata.groundingChunks) {
          result.groundingMetadata.groundingChunks.forEach(chunk => {
            if (chunk.web && chunk.web.uri && chunk.web.title) {
              const sourceKey = chunk.web.uri;
              if (!sourceMap.has(sourceKey)) {
                sourceMap.set(sourceKey, {
                  url: chunk.web.uri,
                  title: chunk.web.title,
                  relevantToQuestions: [result.subQuestion]
                });
              } else {
                const existingSource = sourceMap.get(sourceKey);
                if (!existingSource.relevantToQuestions.includes(result.subQuestion)) {
                  existingSource.relevantToQuestions.push(result.subQuestion);
                }
              }
            }
          });
        }
      });
      
      allSources.push(...sourceMap.values());
      
      // Send final response
      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        message: 'Deep research completed successfully!', 
        progress: 100 
      })}\n\n`);
      
      const finalResult = {
        type: 'completion',
        id: `deep-research-${Date.now()}`,
        object: 'deep_research.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        query: query,
        agentCount: subQuestions.length,
        subQuestions: subQuestions,
        response: finalResponse.choices[0].message.content,
        sources: allSources,
        agentResults: agentResults.map(result => ({
          subQuestion: result.subQuestion,
          agentId: result.agentId,
          hasError: result.error || false,
          sourceCount: result.groundingMetadata?.groundingChunks?.length || 0
        }))
      };
      
      res.write(`data: ${JSON.stringify(finalResult)}\n\n`);
      res.write(`data: [DONE]\n\n`);
      
    } catch (error) {
      console.error('Error in deep research process:', error);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: 'An error occurred during deep research: ' + error.message 
      })}\n\n`);
      res.write(`data: [DONE]\n\n`);
    }
    
    res.end();
    
  } catch (error) {
    console.error('Error in deep research endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error during deep research' });
    }
  }
};