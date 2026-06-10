/**
 * Mock LLM for Testing
 * Provides deterministic responses for tests
 */

/**
 * Predefined responses for common LLM calls
 */
const MOCK_RESPONSES = {
  // Source admission responses
  admission: {
    paper: {
      isResearch: true,
      researchType: 'paper',
      relevanceScore: 0.95,
      domain: 'hydrology',
      reasoning: 'Scientific paper with methods, datasets, and results'
    },
    github: {
      isResearch: true,
      researchType: 'code',
      relevanceScore: 0.85,
      domain: 'machine-learning',
      reasoning: 'Research code repository with documentation'
    },
    news: {
      isResearch: false,
      researchType: 'news',
      relevanceScore: 0.3,
      domain: null,
      reasoning: 'News article without research content'
    },
    dataset: {
      isResearch: true,
      researchType: 'dataset',
      relevanceScore: 0.8,
      domain: 'hydrology',
      reasoning: 'Research dataset with metadata'
    }
  },

  // Decomposition responses
  decomposition: {
    paper: {
      entities: [
        {
          type: 'Paper',
          attributes: {
            title: 'Test Paper Title',
            authors: ['Author One', 'Author Two'],
            year: 2024,
            doi: '10.1234/test.doi'
          },
          name: 'Test Paper'
        },
        {
          type: 'Dataset',
          attributes: {
            name: 'ERA5-Land',
            format: 'gridded',
            variables: ['precipitation', 'temperature']
          },
          name: 'ERA5-Land'
        },
        {
          type: 'Method',
          attributes: {
            name: 'LSTM Ensemble',
            category: 'machine-learning'
          },
          name: 'LSTM Ensemble'
        },
        {
          type: 'Claim',
          attributes: {
            statement: 'The model achieves 0.85 reliability score'
          },
          name: 'Main Result'
        }
      ],
      triples: [
        { subject: 'Test Paper', predicate: 'uses', object: 'ERA5-Land' },
        { subject: 'Test Paper', predicate: 'applies', object: 'LSTM Ensemble' },
        { subject: 'Main Result', predicate: 'supported_by', object: 'Test Paper' }
      ]
    },
    github: {
      entities: [
        {
          type: 'Code',
          attributes: {
            name: 'test-repo',
            repo: 'https://github.com/test/repo',
            language: 'Python',
            stars: 100
          },
          name: 'Test Repo'
        },
        {
          type: 'Method',
          attributes: {
            name: 'Train Model',
            category: 'training'
          },
          name: 'Train Model'
        }
      ],
      triples: [
        { subject: 'Test Repo', predicate: 'implements', object: 'Train Model' }
      ]
    }
  },

  // Research understanding responses
  understanding: {
    overview: {
      title: 'Test Paper Overview',
      problem: 'Flood forecasting in data-scarce regions',
      contribution: 'Novel LSTM ensemble for global flood prediction',
      worthReading: true,
      domain: 'hydrology',
      complexity: 'high'
    },
    methods: {
      methods: [
        {
          name: 'LSTM Ensemble',
          aliases: ['Neural Hydrology'],
          category: 'machine-learning',
          architecture: {
            type: 'LSTM',
            layers: 3,
            hiddenSize: 256
          },
          hyperparameters: {
            learningRate: 0.001,
            batchSize: 32
          }
        }
      ]
    },
    datasets: {
      datasets: [
        {
          name: 'ERA5-Land',
          acronym: 'ERA5L',
          type: 'reanalysis',
          variables: [
            { name: 'precipitation', unit: 'mm/day' },
            { name: 'temperature', unit: 'K' }
          ],
          spatial: {
            coverage: 'global',
            resolution: '0.1°'
          },
          temporal: {
            coverage: '1950-2022',
            resolution: 'hourly'
          },
          access: {
            url: 'https://cds.climate.copernicus.eu/',
            license: 'CC-BY-4.0'
          },
          usage: {
            role: 'input'
          }
        }
      ]
    }
  }
};

/**
 * Mock LLM class
 */
class MockLLM {
  constructor() {
    this.responses = { ...MOCK_RESPONSES };
    this.callHistory = [];
    this.defaultResponse = { result: 'mocked' };
  }

  /**
   * Mock call method
   */
  async call(prompt, options = {}) {
    this.callHistory.push({ prompt, options, timestamp: new Date().toISOString() });

    // Determine response type from prompt
    if (prompt.includes('research relevance') || prompt.includes('isResearch')) {
      return JSON.stringify(this.responses.admission.paper);
    }

    if (prompt.includes('Extract research entities') || prompt.includes('entities and triples')) {
      return JSON.stringify(this.responses.decomposition.paper);
    }

    if (prompt.includes('overview') || prompt.includes('worthReading')) {
      return JSON.stringify(this.responses.understanding.overview);
    }

    if (prompt.includes('methods') && prompt.includes('architecture')) {
      return JSON.stringify(this.responses.understanding.methods);
    }

    if (prompt.includes('datasets') && prompt.includes('variables')) {
      return JSON.stringify(this.responses.understanding.datasets);
    }

    return JSON.stringify(this.defaultResponse);
  }

  /**
   * Mock callJSON method
   */
  async callJSON(prompt, options = {}) {
    const response = await this.call(prompt, options);
    try {
      return JSON.parse(response);
    } catch (err) {
      // Handle markdown code blocks
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    }
  }

  /**
   * Set custom response for specific prompt pattern
   */
  setResponse(pattern, response) {
    this.responses[pattern] = response;
  }

  /**
   * Get call history for assertions
   */
  getCallHistory() {
    return this.callHistory;
  }

  /**
   * Clear call history
   */
  clearHistory() {
    this.callHistory = [];
  }

  /**
   * Get last call
   */
  getLastCall() {
    return this.callHistory[this.callHistory.length - 1];
  }
}

/**
 * Create a mock LLM instance with predefined responses
 */
function createMockLLM(customResponses = {}) {
  const llm = new MockLLM();
  for (const [key, value] of Object.entries(customResponses)) {
    llm.setResponse(key, value);
  }
  return llm;
}

module.exports = {
  MockLLM,
  MOCK_RESPONSES,
  createMockLLM
};
