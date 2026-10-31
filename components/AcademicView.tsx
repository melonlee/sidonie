
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  BookOpen, 
  Calendar, 
  Users, 
  ExternalLink, 
  FileText, 
  X, 
  Sparkles, 
  Loader2,
  Tag,
  RefreshCw,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Radar
} from 'lucide-react';
import { Language, Paper, ApiKeys, UserProfile, Role, Message } from '../types';
import { TRANSLATIONS, DEFAULT_MODEL } from '../constants';
import { streamChatResponse, isMissingApiKeyError } from '../services/geminiService';
import MarkdownRenderer from './MarkdownRenderer';

interface AcademicViewProps {
  language: Language;
  apiKeys: ApiKeys;
  userProfile: UserProfile;
  onSaveNote: (title: string, content: string) => void;
  onOpenSettings?: () => void;
}

const CATEGORY_TAGS = [
  { id: 'all', label: 'All AI', query: 'AI OR Artificial Intelligence' },
  { id: 'cs.CL', label: 'LLM & NLP', query: 'cat:cs.CL OR "Large Language Model"' },
  { id: 'cs.CV', label: 'Vision', query: 'cat:cs.CV OR "Computer Vision"' },
  { id: 'cs.MA', label: 'Agents', query: 'cat:cs.MA OR "Multi-Agent"' },
  { id: 'cs.RO', label: 'Robotics', query: 'cat:cs.RO' },
  { id: 'cs.LG', label: 'Machine Learning', query: 'cat:cs.LG' },
];

// --- arXiv access ---
// The arXiv API doesn't send CORS headers, so browsers can't call it directly.
// Sources are tried in order; the first that works is remembered for the session.
//  1. same-origin proxy served by `npm run dev` / `npm run preview` (vite.config.ts)
//  2. direct request (works if arXiv ever enables CORS, or via a browser extension)
//  3. your own proxy, if built with VITE_ARXIV_PROXY (prefix; the arXiv URL is appended encoded)
//  4. public fallback: api.allorigins.win — a third-party service that sees your search query
type ArxivSource = { id: 'local' | 'direct' | 'custom' | 'public'; build: (qs: string) => string; timeoutMs: number };
const ARXIV_API = 'https://export.arxiv.org/api/query';
const PUBLIC_PROXY = 'https://api.allorigins.win/raw?url=';
const ARXIV_SOURCES: ArxivSource[] = [
  { id: 'local', build: qs => `${import.meta.env.BASE_URL}arxiv-api/query?${qs}`, timeoutMs: 20000 },
  { id: 'direct', build: qs => `${ARXIV_API}?${qs}`, timeoutMs: 8000 },
  ...(import.meta.env.VITE_ARXIV_PROXY
    ? [{ id: 'custom' as const, build: (qs: string) => `${import.meta.env.VITE_ARXIV_PROXY}${encodeURIComponent(`${ARXIV_API}?${qs}`)}`, timeoutMs: 20000 }]
    : []),
  { id: 'public', build: qs => `${PUBLIC_PROXY}${encodeURIComponent(`${ARXIV_API}?${qs}`)}`, timeoutMs: 20000 },
];
let preferredArxivSource: ArxivSource['id'] | null = null;

// Free-text searches become a phrase match across all fields. Without this, arXiv treats
// "spaced repetition" loosely and the newest-first sort surfaces unrelated papers.
// Queries that already use arXiv syntax (e.g. `cat:cs.CL`, `ti:agent`) are passed through.
const toArxivQuery = (input: string) => {
  const q = input.trim();
  if (/\b[a-z]{2,4}:/i.test(q) || /\b(AND|OR|ANDNOT)\b/.test(q)) return q;
  return `all:"${q.replace(/"/g, '')}"`;
};

const fetchArxivFeed = async (qs: string): Promise<{ xml: string; source: ArxivSource['id'] }> => {
  const ordered = preferredArxivSource
    ? [...ARXIV_SOURCES.filter(s => s.id === preferredArxivSource), ...ARXIV_SOURCES.filter(s => s.id !== preferredArxivSource)]
    : ARXIV_SOURCES;
  for (const source of ordered) {
    try {
      const res = await fetch(source.build(qs), { signal: AbortSignal.timeout(source.timeoutMs) });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes('<feed')) continue; // e.g. an HTML 404 page from a static host
      preferredArxivSource = source.id;
      return { xml, source: source.id };
    } catch (e) {
      console.warn(`arXiv source "${source.id}" failed`, e);
    }
  }
  throw new Error('All arXiv sources failed');
};

const AcademicView: React.FC<AcademicViewProps> = ({ language, apiKeys, userProfile, onSaveNote, onOpenSettings }) => {
  const t = TRANSLATIONS[language];
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedSource, setFeedSource] = useState<ArxivSource['id'] | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [startIndex, setStartIndex] = useState(0);
  
  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisContent, setAnalysisContent] = useState('');

  // Daily Briefing State
  const [briefingContent, setBriefingContent] = useState('');
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);

  const fetchPapers = async (searchQuery: string, offset: number = 0, append: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      // Query parameters: search_query, start, max_results (20 per page), sortBy, sortOrder
      const qs = `search_query=${encodeURIComponent(searchQuery)}&start=${offset}&max_results=20&sortBy=submittedDate&sortOrder=descending`;
      const { xml: textData, source } = await fetchArxivFeed(qs);
      setFeedSource(source);
      
      // Parse XML response
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(textData, "text/xml");
      const entries = xmlDoc.getElementsByTagName("entry");
      
      const parsedPapers: Paper[] = [];
      
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        // Ensure unique ID generation based on arxiv ID if possible, else fallback to index
        const arxivId = entry.getElementsByTagName("id")[0]?.textContent || '';
        const id = arxivId ? arxivId.split('/').pop() : `paper-${offset}-${i}`;
        
        const title = entry.getElementsByTagName("title")[0]?.textContent?.replace(/\n/g, ' ').trim() || 'Untitled';
        const summary = entry.getElementsByTagName("summary")[0]?.textContent?.trim() || '';
        const published = entry.getElementsByTagName("published")[0]?.textContent || '';
        
        // Extract authors
        const authorNodes = entry.getElementsByTagName("author");
        const authors = [];
        for (let j = 0; j < authorNodes.length; j++) {
           authors.push(authorNodes[j].getElementsByTagName("name")[0]?.textContent || 'Unknown');
        }

        // Links (alternate is usually the abstract page, pdf is explicitly linked)
        let link = '';
        let pdfLink = '';
        const linkNodes = entry.getElementsByTagName("link");
        for (let k = 0; k < linkNodes.length; k++) {
           const rel = linkNodes[k].getAttribute("rel");
           const href = linkNodes[k].getAttribute("href");
           const title = linkNodes[k].getAttribute("title");
           if (rel === 'alternate') link = href || '';
           if (title === 'pdf' || (href && href.includes('/pdf/'))) pdfLink = href || '';
        }
        
        // Category
        const category = entry.getElementsByTagName("category")[0]?.getAttribute("term") || 'General';

        parsedPapers.push({
          id: id || `local-${i}`,
          title,
          summary,
          authors,
          published: new Date(published).toLocaleDateString(),
          link,
          pdfLink,
          category
        });
      }
      
      if (append) {
        setPapers(prev => [...prev, ...parsedPapers]);
      } else {
        setPapers(parsedPapers);
      }
      
    } catch (err) {
      console.error(err);
      setError(t.radarFetchError);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchPapers(CATEGORY_TAGS[0].query, 0, false);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setActiveCategory('custom');
      setStartIndex(0);
      fetchPapers(toArxivQuery(query), 0, false);
    }
  };

  const handleCategoryClick = (cat: typeof CATEGORY_TAGS[0]) => {
    setActiveCategory(cat.id);
    setQuery('');
    setStartIndex(0);
    fetchPapers(cat.query, 0, false);
  };

  const handleLoadMore = () => {
    const nextOffset = startIndex + 20;
    setStartIndex(nextOffset);
    const q = activeCategory === 'custom' ? toArxivQuery(query) : CATEGORY_TAGS.find(c => c.id === activeCategory)?.query || '';
    fetchPapers(q, nextOffset, true);
  };

  const handleAnalyzePaper = async () => {
    if (!selectedPaper) return;
    setIsAnalyzing(true);
    setAnalysisContent('');

    const prompt = `
      You are an expert AI Researcher.
      Task: Translate and summarize the following academic paper abstract into ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}.
      
      Format your response using Markdown:
      1. **Title Translation**: Translate the title.
      2. **Core Summary**: 3-4 bullet points explaining the main contribution and innovation.
      3. **Key Concepts**: Explain any specific algorithms or benchmarks mentioned (briefly).
      4. **Significance**: Why is this paper important?

      Paper Title: ${selectedPaper.title}
      Abstract: "${selectedPaper.summary}"
    `;

    try {
      const history: Message[] = [
        { id: 'sys', role: Role.USER, text: prompt, timestamp: Date.now() }
      ];

      await streamChatResponse(
        history,
        (chunk) => setAnalysisContent(chunk),
        () => {},
        DEFAULT_MODEL,
        false,
        apiKeys,
        userProfile
      );
    } catch (e) {
      console.error(e);
      if (isMissingApiKeyError(e)) {
        setAnalysisContent(t.noKeyToast);
        onOpenSettings?.();
      } else {
        setAnalysisContent("Analysis failed. Please check your API keys.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateBriefing = async () => {
    if (papers.length === 0) return;
    setIsGeneratingBriefing(true);
    setIsBriefingOpen(true);
    setBriefingContent('');

    // Prepare a list of papers (Title + first sentence of abstract) to save tokens
    const paperList = papers.slice(0, 20).map((p, i) => 
      `${i+1}. ${p.title} (${p.category}) - ${p.summary.split('.')[0]}.`
    ).join('\n');

    const prompt = `
      You are a Research Analyst.
      Based on the following list of the latest AI papers (newest first), provide a concise **Research Radar Briefing** in ${language === 'zh' ? 'Chinese (Simplified)' : 'English'}.
      
      Structure:
      1. **Trending Themes**: What are the top 2-3 topics emerging in this batch? (e.g. LLM Agents, Vision Transformers, etc.)
      2. **Highlight Papers**: Pick 2 most interesting/significant looking titles.
      3. **Quick Statistics**: e.g., "Mostly CV" or "Heavy on NLP".

      Papers:
      ${paperList}
    `;

    try {
        const history: Message[] = [
            { id: 'sys', role: Role.USER, text: prompt, timestamp: Date.now() }
        ];
        await streamChatResponse(
            history,
            (chunk) => setBriefingContent(chunk),
            () => {},
            DEFAULT_MODEL,
            false,
            apiKeys,
            userProfile
        );
    } catch (e) {
        if (isMissingApiKeyError(e)) {
            setBriefingContent(t.noKeyToast);
            onOpenSettings?.();
        } else {
            setBriefingContent("Could not generate briefing.");
        }
    } finally {
        setIsGeneratingBriefing(false);
    }
  };

  const handleSaveToNote = () => {
    if (!selectedPaper) return;
    
    const content = `
# ${selectedPaper.title}

**Published:** ${selectedPaper.published}
**Authors:** ${selectedPaper.authors.join(', ')}
**Category:** ${selectedPaper.category}
**Link:** ${selectedPaper.link}

## Abstract
${selectedPaper.summary}

${analysisContent ? `## AI Analysis\n${analysisContent}` : ''}
    `.trim();

    onSaveNote(`Paper: ${selectedPaper.title.substring(0, 30)}...`, content);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative">
      {/* Header */}
      <div className="px-8 py-6 bg-white border-b border-gray-200">
         <div className="max-w-6xl mx-auto space-y-4">
            <div>
               <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                 <div className="p-2 bg-black text-white rounded-lg"><ExternalLink size={20} /></div>
                 {t.academicTitle}
               </h1>
               <p className="text-gray-500 text-sm mt-1">{t.academicSubtitle}</p>
               {feedSource === 'public' && (
                 <p className="text-[11px] text-gray-400 mt-1">{t.radarPublicProxyNote}</p>
               )}
            </div>

            <div className="flex gap-2 items-center">
               <form onSubmit={handleSearch} className="relative flex-1 max-w-xl">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.searchPapers}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black/10 focus:border-black/20 focus:outline-none transition-all"
                  />
               </form>
            </div>

            <div className="flex gap-2 flex-wrap">
               {CATEGORY_TAGS.map(tag => (
                 <button
                   key={tag.id}
                   onClick={() => handleCategoryClick(tag)}
                   className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeCategory === tag.id ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                 >
                   {tag.label}
                 </button>
               ))}
            </div>
         </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-8">
         <div className="max-w-6xl mx-auto space-y-8">
            
            {/* Research Radar Briefing Section */}
            {papers.length > 0 && (
                <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
                    <button 
                        onClick={() => {
                            if (!briefingContent && !isGeneratingBriefing) handleGenerateBriefing();
                            else setIsBriefingOpen(!isBriefingOpen);
                        }}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-blue-50/50 transition-colors"
                    >
                        <div className="flex items-center gap-3 text-blue-800 font-bold">
                            <Radar size={20} />
                            {t.radarBriefing}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            {isGeneratingBriefing ? <Loader2 size={16} className="animate-spin" /> : null}
                            {isBriefingOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                    </button>
                    {isBriefingOpen && (
                        <div className="px-6 pb-6 pt-2 animate-fade-in">
                            {!briefingContent && isGeneratingBriefing ? (
                                <div className="text-gray-400 text-sm italic">Analyzing latest papers...</div>
                            ) : (
                                <div className="prose prose-sm prose-blue max-w-none">
                                    <MarkdownRenderer content={briefingContent} language={language} isStreaming={isGeneratingBriefing} />
                                </div>
                            )}
                            <div className="mt-4 flex justify-end">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleGenerateBriefing(); }}
                                    className="text-xs flex items-center gap-1 text-gray-400 hover:text-blue-600"
                                >
                                    <RefreshCw size={12} /> Regenerate
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {loading && papers.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Loader2 size={32} className="animate-spin mb-4 text-black" />
                  <p>{t.fetchingPapers}</p>
               </div>
            ) : error ? (
               <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-center">
                  <p className="text-red-500 font-medium mb-2">{error}</p>
                  <p className="text-xs text-gray-400 mb-4 max-w-lg">{t.radarFetchHint}</p>
                  <button onClick={() => fetchPapers(activeCategory === 'custom' ? toArxivQuery(query) : CATEGORY_TAGS.find(c => c.id === activeCategory)?.query || '')} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm">
                     <RefreshCw size={16} /> {t.retry}
                  </button>
               </div>
            ) : papers.length === 0 ? (
               <div className="text-center text-gray-400 py-20">No papers found. Try a different query.</div>
            ) : (
               <>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {papers.map(paper => (
                         <div 
                            key={paper.id} 
                            onClick={() => { setSelectedPaper(paper); setAnalysisContent(''); }}
                            className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer flex flex-col group h-[280px]"
                         >
                            <div className="flex justify-between items-start mb-3">
                               <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider truncate max-w-[150px]">{paper.category}</span>
                               <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                                  <Calendar size={12} /> {paper.published}
                               </span>
                            </div>
                            
                            <h3 className="font-bold text-gray-900 leading-snug mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                               {paper.title}
                            </h3>
                            
                            <div className="flex items-center gap-1 text-xs text-gray-500 mb-4 overflow-hidden whitespace-nowrap">
                               <Users size={12} className="flex-shrink-0" />
                               <span className="truncate">{paper.authors.join(', ')}</span>
                            </div>

                            <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 mb-4 flex-1">
                               {paper.summary}
                            </p>

                            <div className="flex items-center justify-end text-xs font-medium text-gray-400 gap-2 border-t border-gray-50 pt-3 mt-auto">
                               <span className="group-hover:text-black transition-colors">{t.readMore}</span>
                               <ExternalLink size={14} />
                            </div>
                         </div>
                      ))}
                   </div>
                   
                   {/* Load More Button */}
                   <div className="flex justify-center pt-8 pb-12">
                      <button 
                        onClick={handleLoadMore}
                        disabled={loading}
                        className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        {t.loadMorePapers}
                      </button>
                   </div>
               </>
            )}
         </div>
      </div>

      {/* Detail Modal */}
      {selectedPaper && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setSelectedPaper(null)}>
            <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
               {/* Modal Header */}
               <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start bg-white sticky top-0 z-10">
                  <div className="pr-8">
                     <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold uppercase">{selectedPaper.category}</span>
                        <span className="text-sm text-gray-500">{selectedPaper.published}</span>
                     </div>
                     <h2 className="text-xl font-bold text-gray-900 leading-tight">{selectedPaper.title}</h2>
                     <div className="mt-2 text-sm text-gray-600">
                        <span className="font-bold mr-1">{t.authors}:</span> {selectedPaper.authors.join(', ')}
                     </div>
                  </div>
                  <button onClick={() => setSelectedPaper(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                     <X size={20} />
                  </button>
               </div>

               {/* Modal Body */}
               <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                  {/* Actions */}
                  <div className="flex gap-3 flex-wrap">
                     <a 
                        href={selectedPaper.pdfLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-100 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
                     >
                        <FileText size={16} /> {t.viewPdf}
                     </a>
                     <a 
                        href={selectedPaper.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                     >
                        <ExternalLink size={16} /> arXiv Page
                     </a>
                     
                     <div className="flex-1" />

                     <button 
                        onClick={handleSaveToNote}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                     >
                        <Bookmark size={16} /> {t.saveNote}
                     </button>

                     <button 
                        onClick={handleAnalyzePaper}
                        disabled={isAnalyzing}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-white font-medium text-sm shadow-sm transition-all
                           ${isAnalyzing ? 'bg-gray-800 cursor-wait' : 'bg-black hover:bg-gray-800'}
                        `}
                     >
                        {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {t.deepRead}
                     </button>
                  </div>

                  {/* AI Analysis Section */}
                  {(analysisContent || isAnalyzing) && (
                     <div className="bg-gradient-to-br from-blue-50/50 to-purple-50/50 rounded-xl border border-blue-100 p-5 animate-fade-in">
                        <div className="flex items-center gap-2 mb-3 text-blue-700 font-bold text-sm">
                           <Sparkles size={14} /> {t.translation}
                        </div>
                        <div className="text-gray-800 text-sm leading-relaxed">
                           <MarkdownRenderer content={analysisContent} language={language} isStreaming={isAnalyzing} />
                        </div>
                     </div>
                  )}

                  {/* Original Abstract */}
                  <div>
                     <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <FileText size={14} className="text-gray-400" /> {t.originalAbstract}
                     </h3>
                     <p className="text-gray-700 leading-relaxed text-sm bg-gray-50 p-4 rounded-xl border border-gray-100 text-justify">
                        {selectedPaper.summary}
                     </p>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default AcademicView;
