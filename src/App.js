import React, { useEffect, useState, Fragment, useMemo, useCallback } from 'react';
import './App.css';
import awcLogo from './assets/ALAWClogo.png';
import githubLogoSrc from './assets/github-white-icon.png';
import { Description, Dialog, DialogPanel, DialogTitle, Transition } from '@headlessui/react';

const ANILIST_API_DELAY_MS = parseInt(process.env.REACT_APP_ANILIST_API_DELAY_MS, 10) || 4000;

const DEFAULT_LEGEND = {
  complete: ['✔️', 'X'],
  ongoing: ['⭐'],
  incomplete: ['❌', 'O'],
};

const EmptyState = ({ message, subMessage }) => (
  <div className="empty-state-container">
    <p className="empty-state-message">{message}</p>
    {subMessage && <p className="empty-state-submessage">{subMessage}</p>}
  </div>
);

const Toast = ({ message, type = 'success', onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(), 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast toast-${type}`}>
      {message}
      <button onClick={onDismiss} className="toast-dismiss-btn">×</button>
    </div>
  );
};

const ProgressBar = ({ completed, total }) => {
  const percentage = total > 0 ? Math.min((completed / total) * 100, 100) : 0;
  return (
    <div className="progress-bar-container" title={`${completed}/${total} completed on AniList (${Math.round(percentage)}%)`}>
      <div 
        className="progress-bar-filled" 
        style={{ width: `${percentage}%` }}
      />
      <span className="progress-bar-text">{completed}/{total}</span>
    </div>
  );
};


function App() {
  const [anilistUsername, setAnilistUsername] = useState(() => localStorage.getItem('anilistUsername') || '');
  const [tempUsername, setTempUsername] = useState(anilistUsername);
  const [displayedUserAvatar, setDisplayedUserAvatar] = useState(null);
  const [displayedUserBanner, setDisplayedUserBanner] = useState(null);

  const [rawCode, setRawCode] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const APP_VERSION = process.env.REACT_APP_VERSION; // e.g., v0.9.0
  const GITHUB_REPO_URL = "https://github.com/MuchMeheu/AWC-Tracker";
  const MY_ANILIST_PROFILE_URL = "https://anilist.co/user/Meheu/";

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [userLegend, setUserLegend] = useState(() => {
    const savedLegend = localStorage.getItem('userLegend');
    try {
      const parsedLegend = savedLegend ? JSON.parse(savedLegend) : DEFAULT_LEGEND;
      return {
        complete: parsedLegend.complete || [...DEFAULT_LEGEND.complete],
        ongoing: parsedLegend.ongoing || [...DEFAULT_LEGEND.ongoing],
        incomplete: parsedLegend.incomplete || [...DEFAULT_LEGEND.incomplete],
      };
    } catch (e) {
      console.error("Error parsing userLegend from localStorage", e);
      return DEFAULT_LEGEND;
    }
  });
  const [tempLegend, setTempLegend] = useState(JSON.parse(JSON.stringify(userLegend)));


  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.className = theme + '-theme';
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('userLegend', JSON.stringify(userLegend));
    setTempLegend(JSON.parse(JSON.stringify(userLegend))); 
  }, [userLegend]);

  const [challenges, setChallenges] = useState(() => {
    const saved = localStorage.getItem('awcChallenges');
    if (saved) {
      try { return JSON.parse(saved); }
      catch (error) {
        console.error("Failed to parse challenges from localStorage:", error);
        localStorage.removeItem('awcChallenges');
        return [];
      }
    }
    return [];
  });

  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isLegendModalOpen, setIsLegendModalOpen] = useState(false);
  const [isAddingChallenge, setIsAddingChallenge] = useState(false);
  const [addChallengeErrors, setAddChallengeErrors] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isRefreshingChallenge, setIsRefreshingChallenge] = useState(null);

  const [preferredTitle, setPreferredTitle] = useState(() => localStorage.getItem('preferredTitle') || 'romaji');

  // State for Rightbar filtering and sorting
  const [rightbarFilter, setRightbarFilter] = useState('all'); // 'all', 'ongoing', 'completed', 'discrepancies'
  const [rightbarSort, setRightbarSort] = useState('date-desc'); // 'title-asc', 'title-desc', 'progress-desc', 'progress-asc', 'date-desc', 'date-asc'


  useEffect(() => {
    localStorage.setItem('preferredTitle', preferredTitle);
  }, [preferredTitle]);
  
  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
  }, []); 

  const removeToast = (id) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  };
  
  const fetchPublicUserData = useCallback(async (usernameToFetch) => {
    if (!usernameToFetch) {
      setDisplayedUserAvatar(null);
      setDisplayedUserBanner(null);
      return;
    }
    const query = `query ($name: String) { User(name: $name) { avatar { medium } bannerImage } }`;
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { name: usernameToFetch } })
      });
      const json = await response.json();
      if (json.data?.User) {
        setDisplayedUserAvatar(json.data.User.avatar?.medium || null);
        setDisplayedUserBanner(json.data.User.bannerImage || null);
        if (!json.data.User.avatar?.medium && !json.data.User.bannerImage && !json.data.User ) {
             addToast(`User "${usernameToFetch}" not found on AniList.`, 'warning');
        }
      } else {
        setDisplayedUserAvatar(null);
        setDisplayedUserBanner(null);
        addToast(`User "${usernameToFetch}" not found on AniList.`, 'warning');
      }
    } catch (error) {
      console.error("Error fetching public user data:", error);
      setDisplayedUserAvatar(null);
      setDisplayedUserBanner(null);
      addToast(`Could not fetch data for ${usernameToFetch}.`, 'error');
    }
  }, [addToast]); 

  useEffect(() => {
    if (anilistUsername) {
      fetchPublicUserData(anilistUsername);
    } else {
      setDisplayedUserAvatar(null);
      setDisplayedUserBanner(null);
    }
  }, [anilistUsername, fetchPublicUserData]);

  const fetchUserAnimeList = useCallback(async (usernameToFetch) => {
    if (!usernameToFetch) {
      addToast("AniList username is required to fetch list statuses.", 'warning');
      return { completedIds: new Set(), currentIds: new Set(), error: true };
    }
    const query = `query ($userName: String) { MediaListCollection(userName: $userName, type: ANIME) { lists { entries { mediaId status } } } }`;
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { userName: usernameToFetch } })
      });
      const json = await response.json();
      if (!response.ok || json.errors?.length) {
        const errorMessages = json.errors ? json.errors.map(e => e.message).join(', ') : `User "${usernameToFetch}" not found or list private (Status ${response.status})`;
        console.error("Failed to fetch user anime list:", errorMessages);
        addToast(`Error fetching ${usernameToFetch}'s AniList: ${errorMessages}`, 'error');
        return { completedIds: new Set(), currentIds: new Set(), error: true };
      }
      if (json.data?.MediaListCollection) {
        const allEntries = json.data.MediaListCollection.lists.flatMap(list => list.entries);
        const completedIds = new Set(allEntries.filter(e => e.status === 'COMPLETED').map(e => e.mediaId));
        const currentIds = new Set(allEntries.filter(e => e.status === 'CURRENT').map(e => e.mediaId));
        return { completedIds, currentIds };
      }
    } catch (error) {
      console.error("Network error fetching user anime list:", error);
      addToast(`Network error fetching ${usernameToFetch}'s AniList: ${error.message}`, 'error');
    }
    return { completedIds: new Set(), currentIds: new Set(), error: true };
  }, [addToast]);


  const handleRefreshAllChallenges = useCallback(async (newUsername) => {
    if (!newUsername || challenges.length === 0) return;
    setIsRefreshingAll(true);
    addToast(`Refreshing all challenges for ${newUsername}...`, 'info');

    const userList = await fetchUserAnimeList(newUsername);
    if (userList.error) {
      setIsRefreshingAll(false);
      addToast(`Could not get ${newUsername}'s list. Refresh failed.`, 'error');
      return;
    }

    const updatedChallengesData = challenges.map(challenge => {
      const updatedEntries = challenge.entries.map(entry => ({
        ...entry,
        statusAniList: userList.completedIds.has(parseInt(entry.animeId)) ? 'complete'
                       : userList.currentIds.has(parseInt(entry.animeId)) ? 'ongoing'
                       : 'incomplete'
      }));
      return { ...challenge, entries: updatedEntries };
    });

    setChallenges(updatedChallengesData);
    localStorage.setItem('awcChallenges', JSON.stringify(updatedChallengesData));
    if(selectedChallenge){ 
        const currentlySelected = updatedChallengesData.find(ch => ch.id === selectedChallenge.id);
        if(currentlySelected) setSelectedChallenge(currentlySelected);
    }
    setIsRefreshingAll(false);
    addToast(`All challenges refreshed for ${newUsername}.`, 'success');
  }, [challenges, fetchUserAnimeList, addToast, selectedChallenge]);


  const handleUsernameSave = useCallback(async () => {
    const newUsername = tempUsername.trim();
    if (newUsername && newUsername !== anilistUsername) {
      setAnilistUsername(newUsername);
      localStorage.setItem('anilistUsername', newUsername);
      addToast(`AniList username set to: ${newUsername}`, 'success');
      await fetchPublicUserData(newUsername); 
      if (challenges.length > 0) {
        await handleRefreshAllChallenges(newUsername); 
      }
    } else if (!newUsername && anilistUsername) {
      setAnilistUsername('');
      setDisplayedUserAvatar(null);
      setDisplayedUserBanner(null);
      localStorage.removeItem('anilistUsername');
      addToast('AniList username cleared.', 'info');
    } else if (newUsername && newUsername === anilistUsername) {
        addToast(`Username "${newUsername}" is already set.`, 'info');
    }
  }, [tempUsername, anilistUsername, fetchPublicUserData, challenges, handleRefreshAllChallenges, addToast]);
  
  useEffect(() => {
    setTempUsername(anilistUsername);
  }, [anilistUsername]);


  const getDisplayTitle = useCallback((entry) => {
    if (!entry) return 'Unknown Title';
    return (preferredTitle === 'english' && entry.englishTitle) ? entry.englishTitle : (entry.romajiTitle || 'Unknown Title');
  }, [preferredTitle]);

  const fetchAnime = useCallback(async (animeId) => {
    const query = `query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji english } coverImage { medium } } }`;
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { id: parseInt(animeId) } })
      });
      const json = await response.json();
      if (!response.ok) {
        let errorMsg = `API request for ID ${animeId} failed with status ${response.status}.`;
        if (json?.errors?.length) errorMsg += ` Details: ${json.errors.map(e => e.message).join(', ')}`;
        console.warn(errorMsg); return { error: errorMsg };
      }
      if (json.data?.Media) return json.data.Media;
      let errorDetail = json?.errors?.length ? json.errors.map(e => e.message).join(', ') : "Unknown reason";
      console.warn(`No data for anime ID ${animeId}: ${errorDetail}`); return { error: `No data for ID ${animeId}: ${errorDetail}` };
    } catch (err) {
      console.warn(`Network error fetching anime ID ${animeId}:`, err.message);
      return { error: `Network error fetching ID ${animeId}: ${err.message}` };
    }
  }, []);

  const handleAddChallenge = useCallback(async () => {
    if (!rawCode) { addToast("Challenge code cannot be empty.", "warning"); return;}
    if (!anilistUsername) {
        addToast("Please set your AniList username first in the sidebar.", "warning");
        return;
    }
    setIsAddingChallenge(true); setAddChallengeErrors([]); const localErrors = [];
    try {
      const lines = rawCode.split('\n').map(line => line.trim());
      const headerLine = lines.find(line => line.startsWith('#'));
      const autoTitle = headerLine ? headerLine.replace(/[#_]/g, '').trim() : `Challenge ${Date.now()}`;
      
      const allUserSymbols = [
        ...(userLegend.complete || []),
        ...(userLegend.ongoing || []),
        ...(userLegend.incomplete || []),
      ].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      const statusRegex = allUserSymbols.length > 0 ? new RegExp(`\\[(${allUserSymbols.join('|')})\\]`) : null;

      const entries = [];
      if (statusRegex) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]; 
          const statusMatch = line.match(statusRegex);

          if (statusMatch) {
            const statusSymbol = statusMatch[1]; 
            let statusChallenge = 'incomplete'; 
            if ((userLegend.complete || []).includes(statusSymbol)) statusChallenge = 'complete';
            else if ((userLegend.ongoing || []).includes(statusSymbol)) statusChallenge = 'ongoing';
            
            const titleMatch = line.match(/__(.+?)__/); const titleFromPost = titleMatch ? titleMatch[1] : 'Unknown';
            const urlLine = lines[i + 1] || ''; const urlMatch = urlLine.match(/anime\/(\d+)/); const animeId = urlMatch ? urlMatch[1] : null;
            const datesLine = lines[i + 2] || ''; const startMatch = datesLine.match(/Start:\s*([\d-]+)/); const endMatch = datesLine.match(/Finish:\s*([\d-]+)/);
            if (animeId) entries.push({ animeId, title: titleFromPost, statusChallenge, startDate: startMatch?.[1], endDate: endMatch?.[1] });
          }
        }
      } else {
        localErrors.push("No legend symbols defined for parsing. Please set them via 'Customize Legend'.");
      }
      
      const userList = await fetchUserAnimeList(anilistUsername);
      if (userList.error) localErrors.push(`Could not fetch AniList data for ${anilistUsername}. Challenge statuses from post will be used.`);

      const enriched = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const fetchResult = await fetchAnime(entry.animeId);
        if (fetchResult.error) {
          localErrors.push(`AniList ID ${entry.animeId} (Title: ${entry.title}): ${fetchResult.error}`);
          enriched.push(null);
        } else {
          const info = fetchResult;
          const statusAniList = userList.completedIds.has(parseInt(entry.animeId)) ? 'complete' : userList.currentIds.has(parseInt(entry.animeId)) ? 'ongoing' : 'incomplete';
          enriched.push({ ...entry, id: i, romajiTitle: info.title.romaji, englishTitle: info.title.english, image: info.coverImage.medium, statusAniList });
        }
        if (i < entries.length - 1) await new Promise(res => setTimeout(res, ANILIST_API_DELAY_MS));
      }
      setAddChallengeErrors(localErrors);
      const filtered = enriched.filter(Boolean);
      if (filtered.length === 0 && entries.length > 0 && localErrors.filter(e => !e.startsWith("Could not fetch AniList data")).length === entries.length) {
        if (localErrors.length === 0) setAddChallengeErrors(prev => [...prev, "No valid anime entries processed."]);
        addToast("No valid anime entries could be processed.", 'warning');
        setIsAddingChallenge(false); return;
      }
      if (filtered.length === 0 && entries.length === 0 && statusRegex) {
         addToast("No challenge entries found in the provided code based on your legend.", 'warning');
         setIsAddingChallenge(false); return;
      }

      const newChallenge = { id: Date.now(), title: autoTitle, postUrl, entries: filtered };
      const updatedChallengesData = [...challenges, newChallenge];
      setChallenges(updatedChallengesData); localStorage.setItem('awcChallenges', JSON.stringify(updatedChallengesData));
      setRawCode(''); setPostUrl(''); addToast(`Challenge "${autoTitle}" added!`, 'success');
    } catch (error) {
      console.error("Error adding challenge:", error);
      setAddChallengeErrors(prev => [...prev, `Unexpected error: ${error.message}`]);
      addToast("Failed to add challenge.", 'error');
    } finally { setIsAddingChallenge(false); }
  }, [rawCode, anilistUsername, challenges, postUrl, userLegend, fetchUserAnimeList, fetchAnime, addToast]);

  const deleteChallenge = (id) => {
    const challengeToDelete = challenges.find(ch => ch.id === id);
    if (window.confirm(`Delete challenge "${challengeToDelete?.title || 'this'}"? This cannot be undone.`)) {
      const updated = challenges.filter(ch => ch.id !== id);
      setChallenges(updated); localStorage.setItem('awcChallenges', JSON.stringify(updated));
      if (selectedChallenge?.id === id) setSelectedChallenge(null);
      addToast(`Challenge "${challengeToDelete?.title || 'Selected'}" deleted.`, 'info');
    }
  };

  const generateChallengeCode = useCallback((challenge) => {
    const legendComplete = (userLegend.complete && userLegend.complete[0]) || '✔️';
    const legendOngoing = (userLegend.ongoing && userLegend.ongoing[0]) || '⭐';
    const legendIncomplete = (userLegend.incomplete && userLegend.incomplete[0]) || '❌';

    const header = `#__${challenge.title}__\n\nChallenge Start Date: YYYY-MM-DD\nChallenge Finish Date: YYYY-MM-DD\nLegend: [${legendComplete}] = Completed [${legendIncomplete}] = Not Completed [${legendOngoing}] = Ongoing\n\n<hr>\n`;
    const blocks = challenge.entries.map((entry, i) => {
      let symbol = legendIncomplete; 
      if (entry.statusAniList === 'complete') symbol = legendComplete;
      else if (entry.statusAniList === 'ongoing') symbol = legendOngoing;
      else { 
        if (entry.statusChallenge === 'complete') symbol = legendComplete;
        else if (entry.statusChallenge === 'ongoing') symbol = legendOngoing;
      }
      return `${String(i + 1).padStart(2, '0')}) [${symbol}] __${getDisplayTitle(entry)}__\nhttps://anilist.co/anime/${entry.animeId}/\nStart: ${entry.startDate || 'YYYY-MM-DD'} Finish: ${entry.endDate || 'YYYY-MM-DD'}`;
    });
    return header + blocks.join('\n\n');
  }, [getDisplayTitle, userLegend]);

  const handleCopyChallengeCode = useCallback((challenge) => {
    navigator.clipboard.writeText(generateChallengeCode(challenge));
    addToast("Challenge code copied!", 'success');
  }, [generateChallengeCode, addToast]);

  const handleCopyPostUrl = useCallback((challenge) => {
    navigator.clipboard.writeText(challenge.postUrl || '');
    addToast("Post URL copied!", 'success');
  }, [addToast]);

  const handleRefreshSingleChallengeStatus = useCallback(async (challengeId) => {
    if (!anilistUsername) { addToast("Please set your AniList username to refresh.", 'warning'); return; }
    const challengeToRefresh = challenges.find(ch => ch.id === challengeId);
    if (!challengeToRefresh) { addToast("Challenge not found.", 'error'); return; }
    setIsRefreshingChallenge(challengeId); addToast(`Refreshing "${challengeToRefresh.title}" for ${anilistUsername}...`, 'info');
    
    const userList = await fetchUserAnimeList(anilistUsername);
    if (userList.error) { setIsRefreshingChallenge(null); return; }

    const updatedEntries = challengeToRefresh.entries.map(entry => ({
      ...entry,
      statusAniList: userList.completedIds.has(parseInt(entry.animeId)) ? 'complete' : userList.currentIds.has(parseInt(entry.animeId)) ? 'ongoing' : 'incomplete'
    }));
    await new Promise(res => setTimeout(res, 300)); 
    const updatedChallengesData = challenges.map(ch => ch.id === challengeId ? { ...ch, entries: updatedEntries } : ch);
    setChallenges(updatedChallengesData); localStorage.setItem('awcChallenges', JSON.stringify(updatedChallengesData));
    if (selectedChallenge?.id === challengeId) setSelectedChallenge(updatedChallengesData.find(ch => ch.id === challengeId));
    setIsRefreshingChallenge(null); addToast(`"${challengeToRefresh.title}" refreshed for ${anilistUsername}!`, 'success');
  }, [anilistUsername, challenges, fetchUserAnimeList, selectedChallenge, addToast]);

  const globalAnime = useMemo(() => (
    challenges.flatMap(ch => ch.entries).reduce((acc, anime) => {
      if (!anime?.animeId) return acc;
      if (!acc[anime.animeId]) acc[anime.animeId] = { ...anime, count: 1, challengeStatuses: [anime.statusChallenge] };
      else { acc[anime.animeId].count++; acc[anime.animeId].challengeStatuses.push(anime.statusChallenge); }
      return acc;
    }, {})
  ), [challenges]);

  const getEffectiveChallengeStatus = useCallback((anime) => {
    if (!anime?.challengeStatuses) return 'incomplete';
    if (anime.challengeStatuses.includes('complete')) return 'complete';
    if (anime.challengeStatuses.includes('ongoing')) return 'ongoing';
    return 'incomplete';
  }, []);

  const handleClearAllData = () => {
    if (window.confirm("ARE YOU SURE?\nThis deletes ALL saved challenges & your AniList username.\nCANNOT be undone.")) {
      if (window.confirm("FINAL CONFIRMATION:\nReally delete all data?")) {
        localStorage.removeItem('awcChallenges'); 
        localStorage.removeItem('anilistUsername');
        localStorage.removeItem('preferredTitle'); 
        localStorage.removeItem('theme');
        localStorage.removeItem('userLegend');
        setChallenges([]); 
        setAnilistUsername(''); setTempUsername(''); setDisplayedUserAvatar(null); setDisplayedUserBanner(null);
        setSelectedChallenge(null); setRawCode(''); setPostUrl(''); setAddChallengeErrors([]);
        setPreferredTitle('romaji'); setTheme('dark'); setUserLegend(DEFAULT_LEGEND);
        setIsHelpModalOpen(false); setIsLegendModalOpen(false); addToast("All app data cleared.", 'info');
      }
    }
  };

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  const handleLegendInputChange = (statusType, index, value) => {
    const newLegend = JSON.parse(JSON.stringify(tempLegend));
    if (!newLegend[statusType]) newLegend[statusType] = [];
    newLegend[statusType][index] = value; 
    setTempLegend(newLegend);
  };

  const handleAddLegendSymbol = (statusType) => {
    const newLegend = JSON.parse(JSON.stringify(tempLegend));
    if (!newLegend[statusType]) newLegend[statusType] = [];
    newLegend[statusType].push('');
    setTempLegend(newLegend);
  };

  const handleRemoveLegendSymbol = (statusType, index) => {
    const newLegend = JSON.parse(JSON.stringify(tempLegend));
    if (newLegend[statusType] && newLegend[statusType].length > 0) {
        newLegend[statusType].splice(index, 1);
    }
    setTempLegend(newLegend);
  };

  const saveUserLegend = () => {
    const cleanedLegendInput = {
        complete: (tempLegend.complete || []).map(s => s.trim()).filter(s => s !== ''),
        ongoing: (tempLegend.ongoing || []).map(s => s.trim()).filter(s => s !== ''),
        incomplete: (tempLegend.incomplete || []).map(s => s.trim()).filter(s => s !== ''),
    };

    const allSymbols = [
        ...cleanedLegendInput.complete, 
        ...cleanedLegendInput.ongoing, 
        ...cleanedLegendInput.incomplete
    ];
    const uniqueSymbols = new Set(allSymbols);

    if (allSymbols.length !== uniqueSymbols.size) {
        const counts = {};
        const duplicates = [];
        allSymbols.forEach(symbol => {
            counts[symbol] = (counts[symbol] || 0) + 1;
            if (counts[symbol] > 1 && !duplicates.includes(symbol)) {
                let categoriesInvolved = 0;
                if (cleanedLegendInput.complete.includes(symbol)) categoriesInvolved++;
                if (cleanedLegendInput.ongoing.includes(symbol)) categoriesInvolved++;
                if (cleanedLegendInput.incomplete.includes(symbol)) categoriesInvolved++;
                if (categoriesInvolved > 1) {
                    duplicates.push(symbol);
                }
            }
        });
        
        if (duplicates.length > 0) {
            addToast(`Error: Symbol(s) "${duplicates.join('", "')}" cannot be used for multiple status types. Please use unique symbols for each status category.`, 'error');
            return;
        }
    }
    
    if (cleanedLegendInput.complete.length === 0 && 
        cleanedLegendInput.ongoing.length === 0 && 
        cleanedLegendInput.incomplete.length === 0) {
        addToast("Cannot save an empty legend. Resetting to defaults.", 'warning');
        setUserLegend(DEFAULT_LEGEND);
        setIsLegendModalOpen(false);
        return;
    }

    const finalLegendToSave = {
        complete: cleanedLegendInput.complete.length > 0 ? cleanedLegendInput.complete : [...DEFAULT_LEGEND.complete],
        ongoing: cleanedLegendInput.ongoing.length > 0 ? cleanedLegendInput.ongoing : [...DEFAULT_LEGEND.ongoing],
        incomplete: cleanedLegendInput.incomplete.length > 0 ? cleanedLegendInput.incomplete : [...DEFAULT_LEGEND.incomplete],
    };
    
    setUserLegend(finalLegendToSave);
    addToast("Custom legend saved!", 'success');
    setIsLegendModalOpen(false);
  };

  const handleExportData = () => {
    const dataToExport = {
      anilistUsername,
      theme,
      preferredTitle,
      userLegend,
      challenges,
      appVersion: APP_VERSION 
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(dataToExport, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    link.download = `awc-tracker-backup-${timestamp}.json`;
    link.click();
    addToast("Data exported successfully!", "success");
  };

  const handleImportData = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          if (typeof importedData.anilistUsername === 'string' &&
              Array.isArray(importedData.challenges) &&
              typeof importedData.theme === 'string' &&
              typeof importedData.preferredTitle === 'string' &&
              typeof importedData.userLegend === 'object' &&
              Array.isArray(importedData.userLegend.complete) &&
              Array.isArray(importedData.userLegend.ongoing) &&
              Array.isArray(importedData.userLegend.incomplete)
          ) {
            if (window.confirm("Importing data will overwrite your current settings and challenges. Are you sure?")) {
                setAnilistUsername(importedData.anilistUsername || '');
                setTheme(importedData.theme || 'dark');
                setPreferredTitle(importedData.preferredTitle || 'romaji');
                setUserLegend(importedData.userLegend || DEFAULT_LEGEND);
                setChallenges(importedData.challenges || []);
                
                localStorage.setItem('anilistUsername', importedData.anilistUsername || '');
                localStorage.setItem('theme', importedData.theme || 'dark');
                localStorage.setItem('preferredTitle', importedData.preferredTitle || 'romaji');
                localStorage.setItem('userLegend', JSON.stringify(importedData.userLegend || DEFAULT_LEGEND));
                localStorage.setItem('awcChallenges', JSON.stringify(importedData.challenges || []));
                
                addToast("Data imported successfully! Refreshing challenges...", "success");
                if (importedData.anilistUsername && (importedData.challenges || []).length > 0) {
                    handleRefreshAllChallenges(importedData.anilistUsername);
                }
                setIsHelpModalOpen(false); 
            }
          } else {
            addToast("Invalid or corrupted import file.", "error");
          }
        } catch (err) {
          console.error("Error importing data:", err);
          addToast("Failed to import data. File might be corrupted.", "error");
        } finally {
            event.target.value = null; 
        }
      };
      reader.readAsText(file);
    }
  };


  const renderChallengeDetail = useCallback((challenge) => {
    const completedOnAniList = challenge.entries.filter(e => e.statusAniList === 'complete').length;
    const totalEntries = challenge.entries.length;

    return (
        <div className="challenge-detail-view">
        <button className="back-button" onClick={() => setSelectedChallenge(null)}>⬅️ Back</button>
        <div className="challenge-detail-header">
            <h2>{challenge.title}</h2>
            {anilistUsername && <button onClick={() => handleRefreshSingleChallengeStatus(challenge.id)} disabled={isRefreshingChallenge === challenge.id} className="refresh-challenge-btn">{isRefreshingChallenge === challenge.id ? '🔄 Refreshing...' : '🔄 Refresh AniList Status'}</button>}
        </div>
        {totalEntries > 0 && (
            <div className="challenge-detail-progress">
                <ProgressBar completed={completedOnAniList} total={totalEntries} />
            </div>
        )}
        {challenge.postUrl && <p className="challenge-post-url">Post URL: <a href={challenge.postUrl} target="_blank" rel="noreferrer">{challenge.postUrl}</a></p>}
        {challenge.entries.length === 0 ? (<EmptyState message="No anime entries in this challenge." />) : (
            <ul>{challenge.entries.map((entry) => (
            <li key={entry.id} className="anime-entry-item">
                <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer"><img src={entry.image} alt={getDisplayTitle(entry)} className="anime-entry-image"/></a>
                <div className="anime-entry-details">
                <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer"><strong>{getDisplayTitle(entry)}</strong></a>
                <span className="anime-entry-status">AniList: {entry.statusAniList === 'complete' ? '✅' : entry.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge: {entry.statusChallenge === 'complete' ? '✅' : entry.statusChallenge === 'ongoing' ? '⭐' : '❌'}</span>
                {entry.statusAniList === 'complete' && entry.statusChallenge === 'incomplete' && (<div className="status-warning">⚠️ Needs post update</div>)}
                {entry.statusAniList === 'incomplete' && entry.statusChallenge === 'complete' && (<div className="status-info">ℹ️ Marked complete in challenge</div>)}
                <span className="anime-entry-dates">Start: {entry.startDate || '—'} | Finish: {entry.endDate || '—'}</span>
                </div>
            </li>))}
            </ul>
        )}
        </div>
    );
  }, [anilistUsername, isRefreshingChallenge, getDisplayTitle, handleRefreshSingleChallengeStatus]);

  const filteredAndSortedChallenges = useMemo(() => {
    let processedChallenges = [...challenges];

    // Filtering
    if (rightbarFilter !== 'all') {
      processedChallenges = processedChallenges.filter(ch => {
        const completedCount = ch.entries.filter(e => e.statusAniList === 'complete').length;
        const totalCount = ch.entries.length;
        if (totalCount === 0 && rightbarFilter !== 'all') return false; // Exclude empty challenges from specific filters

        switch (rightbarFilter) {
          case 'ongoing':
            return totalCount > 0 && completedCount < totalCount;
          case 'completed':
            return totalCount > 0 && completedCount === totalCount;
          case 'discrepancies':
            return ch.entries.some(e => e.statusAniList === 'complete' && e.statusChallenge !== 'complete');
          default:
            return true;
        }
      });
    }

    // Sorting
    processedChallenges.sort((a, b) => {
      switch (rightbarSort) {
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'title-desc':
          return b.title.localeCompare(a.title);
        case 'progress-desc': {
          const progressA = a.entries.length > 0 ? (a.entries.filter(e => e.statusAniList === 'complete').length / a.entries.length) : -1;
          const progressB = b.entries.length > 0 ? (b.entries.filter(e => e.statusAniList === 'complete').length / b.entries.length) : -1;
          return progressB - progressA;
        }
        case 'progress-asc': {
          const progressA = a.entries.length > 0 ? (a.entries.filter(e => e.statusAniList === 'complete').length / a.entries.length) : Infinity;
          const progressB = b.entries.length > 0 ? (b.entries.filter(e => e.statusAniList === 'complete').length / b.entries.length) : Infinity;
          return progressA - progressB;
        }
        case 'date-asc':
          return a.id - b.id;
        case 'date-desc':
        default:
          return b.id - a.id;
      }
    });

    return processedChallenges;
  }, [challenges, rightbarFilter, rightbarSort]);


  return (
    <div className="App">
      <div className="toast-container">
        {toasts.map(toast => <Toast key={toast.id} message={toast.message} type={toast.type} onDismiss={() => removeToast(toast.id)} />)}
      </div>

      <div className="sidebar">
        <div className="sidebar-top-content">
          <div onClick={() => setSelectedChallenge(null)} className="app-title-container">
            <img src={awcLogo} alt="AWC Tracker Logo" className="app-logo" />
            <span className="app-title-text">AWC Tracker</span>
          </div>
          
          <div className="anilist-username-section">
            <input 
              type="text"
              className="anilist-username-input"
              placeholder="AniList Username"
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              onKeyDown={(e) => {if (e.key === 'Enter') handleUsernameSave();}}
            />
            <button 
                onClick={handleUsernameSave} 
                className="anilist-username-save-btn"
                disabled={isRefreshingAll}
            >
              {isRefreshingAll ? '🔄...' : (anilistUsername && anilistUsername === tempUsername.trim() && tempUsername.trim() !== '' ? '✔️ Set' : 'Set')}
            </button>
          </div>

          {anilistUsername && (
            <div 
              className="current-anilist-user" 
              style={displayedUserBanner ? { backgroundImage: `url(${displayedUserBanner})` } : {}}
            >
              {displayedUserBanner && (
                <img 
                  src={displayedUserBanner} 
                  alt={`${anilistUsername}'s banner`} 
                  className="current-user-banner-img" 
                />
              )}
              <div className="current-anilist-user-overlay">
                {displayedUserAvatar && <img src={displayedUserAvatar} alt={anilistUsername} className="current-user-avatar" />}
                <span className="current-user-text-container">
                  Tracking for: <a href={`https://anilist.co/user/${anilistUsername}/animelist`} target="_blank" rel="noopener noreferrer">{anilistUsername}</a>
                </span>
              </div>
            </div>
          )}

          <h3>Saved Challenges</h3>
        </div>
        {challenges.length === 0 ? (<EmptyState message="No challenges saved." subMessage="Add one in the main panel." />)
          : (<ul>{challenges.map(ch => (<li key={ch.id} onClick={() => setSelectedChallenge(ch)} className={`sidebar-challenge-item ${selectedChallenge?.id === ch.id ? 'selected' : ''}`}><strong>{ch.title}</strong></li>))}</ul>)}

        <div className="sidebar-bottom-controls">
          <div className="sidebar-action-buttons">
             <button 
              onClick={toggleTheme} 
              className="theme-toggle-button icon-button" 
              title={`Toggle ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button 
              className="help-button" 
              onClick={() => setIsHelpModalOpen(true)} 
              title="Help"
            >
              ❓ Help
            </button>
            <button 
              onClick={() => setPreferredTitle(p => p === 'romaji' ? 'english' : 'romaji')} 
              className={`title-toggle-button ${preferredTitle === 'romaji' ? 'toggle-active-romaji' : 'toggle-active-english'}`} 
              title={`Switch to ${preferredTitle === 'romaji' ? 'English' : 'Romaji'} titles`}
            >
              {preferredTitle === 'romaji' ? 'English' : 'Romaji'}
            </button>
          </div>
           <div className="sidebar-app-meta">
                <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="github-link" title="View Source on GitHub">
                  <img src={githubLogoSrc} alt="GitHub" className="github-logo-img" />
                  <span>GitHub</span>
                </a>
                <span className="app-credit-line">
                  by <a href={MY_ANILIST_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="meta-profile-link">Meheu</a>
                </span>
                {APP_VERSION && <span className="app-version-text">v{APP_VERSION}</span>}
            </div>
            <div className="app-disclaimer-footer">
                Fan-made tool. Not official AWC or AniList.
            </div>
        </div>
      </div>

      <div className="main">
        {!selectedChallenge ? (
          <>
            <div className="add-challenge-section">
              <div className="section-header">
                <h2>➕ Add Challenge</h2>
                <button 
                  onClick={() => { setIsLegendModalOpen(true); setTempLegend(JSON.parse(JSON.stringify(userLegend)));}} 
                  className="button-secondary customize-legend-main-btn"
                  title="Customize how challenge statuses are parsed"
                >
                  ⚙️ Customize Legend
                </button>
              </div>
              <textarea value={rawCode} onChange={(e) => setRawCode(e.target.value)} rows={8} placeholder="Paste challenge code here..." />
              <input type="text" placeholder="Optional: Forum post URL" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
              <button onClick={handleAddChallenge} disabled={isAddingChallenge || !anilistUsername}>{isAddingChallenge ? '⏳ Adding...' : '➕ Save Challenge'}</button>
              {!anilistUsername && <p className="username-required-note">Please set your AniList username in the sidebar to add challenges.</p>}
              {addChallengeErrors.length > 0 && (<div className="challenge-add-errors"><h4>Encountered issues:</h4>{addChallengeErrors.map((err, i) => <p key={i} className="error-item">{err}</p>)}</div>)}
            </div>

            <div className="global-tracker-section">
              <h2><span role="img" aria-label="globe">🌐</span> Global Tracker</h2>
              {Object.keys(globalAnime).length === 0 ? (<EmptyState message="No anime to display." subMessage={challenges.length > 0 ? "Entries might be processing or challenges are empty." : "Add challenges to see global stats."} />)
                : (<ul>{Object.values(globalAnime).map(anime => {
                  if (!anime?.animeId) return null;
                  const effChallStatus = getEffectiveChallengeStatus(anime);
                  return (
                    <li key={anime.animeId} className="anime-entry-item">
                      <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer"><img src={anime.image} alt={getDisplayTitle(anime)} className="anime-entry-image"/></a>
                      <div className="anime-entry-details">
                        <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer"><strong>{getDisplayTitle(anime)}</strong></a>
                        <span className="anime-entry-status">AniList: {anime.statusAniList === 'complete' ? '✅' : anime.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge(s): {effChallStatus === 'complete' ? '✅' : effChallStatus === 'ongoing' ? '⭐' : '❌'}</span>
                        {anime.statusAniList === 'complete' && effChallStatus === 'incomplete' && (<div className="status-warning">⚠️ Needs post update</div>)}
                        {anime.statusAniList === 'incomplete' && effChallStatus === 'complete' && (<div className="status-info">ℹ️ Marked complete in challenge</div>)}
                        {anime.count > 1 && (<div className="count-info">🔁 In {anime.count} challenges</div>)}
                      </div>
                    </li>);
                })}</ul>)}
            </div>
          </>
        ) : (renderChallengeDetail(selectedChallenge))}
      </div>

      <div className="rightbar">
        <h2>📋 Manage</h2>
        <div className="manage-controls">
          <div className="filter-sort-group">
            <label htmlFor="filter-challenges">Filter:</label>
            <select id="filter-challenges" value={rightbarFilter} onChange={(e) => setRightbarFilter(e.target.value)} className="control-select">
              <option value="all">All</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="discrepancies">Has Discrepancies</option>
            </select>
          </div>
          <div className="filter-sort-group">
            <label htmlFor="sort-challenges">Sort by:</label>
            <select id="sort-challenges" value={rightbarSort} onChange={(e) => setRightbarSort(e.target.value)} className="control-select">
              <option value="date-desc">Date Added (Newest)</option>
              <option value="date-asc">Date Added (Oldest)</option>
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
              <option value="progress-desc">Progress (Most)</option>
              <option value="progress-asc">Progress (Least)</option>
            </select>
          </div>
        </div>

        {filteredAndSortedChallenges.length === 0 ? (<EmptyState message="No challenges match your filters." />)
          : (<ul>{filteredAndSortedChallenges.map((ch) => {
            const completedOnAniList = ch.entries.filter(e => e.statusAniList === 'complete').length;
            const totalEntries = ch.entries.length;
            return (
              <li key={ch.id} className="manage-challenge-item">
                <div className="manage-challenge-details">
                  <strong>{ch.title}</strong>
                  <ProgressBar completed={completedOnAniList} total={totalEntries} />
                  <div className="button-row">
                    <button onClick={() => handleCopyPostUrl(ch)} disabled={!ch.postUrl}>🔗 Copy URL</button>
                    <button onClick={() => handleCopyChallengeCode(ch)}>📋 Copy Code</button>
                  </div>
                  {ch.postUrl && (<div className="awc-link"><a href={`https://awc.moe/challenges/editor?url=${encodeURIComponent(ch.postUrl)}`} target="_blank" rel="noreferrer">🌐 AWC Editor</a></div>)}
                </div>
                <button onClick={() => deleteChallenge(ch.id)} title="Delete Challenge" className="delete-button">🗑️</button>
              </li>);
          })}</ul>)}
      </div>

      <Transition appear show={isHelpModalOpen} as={Fragment}>
        <Dialog as="div" className="dialog-root" onClose={() => setIsHelpModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="dialog-backdrop-enter-active"
            enterFrom="dialog-backdrop-enter-from"
            enterTo="dialog-backdrop-enter-to"
            leave="dialog-backdrop-leave-active"
            leaveFrom="dialog-backdrop-leave-from"
            leaveTo="dialog-backdrop-leave-to"
          >
            <div className="dialog-backdrop" />
          </Transition.Child>

          <div className="dialog-container">
            <Transition.Child
              as={Fragment}
              enter="dialog-panel-enter-active"
              enterFrom="dialog-panel-enter-from"
              enterTo="dialog-panel-enter-to"
              leave="dialog-panel-leave-active"
              leaveFrom="dialog-panel-leave-from"
              leaveTo="dialog-panel-leave-to"
            >
              <DialogPanel className="dialog-panel">
                <DialogTitle className="dialog-title">How to Use AWC Tracker</DialogTitle>
                <Description as="div" className="dialog-description">
                  <p>This tool helps you track your Anime Watching Club Challenges (AWC) progress by parsing your forum posts and comparing them with your AniList activity.</p>
                  <ul className="dialog-list">
                    <li><strong>👤 Set AniList Username:</strong> Enter your AniList username in the sidebar and click "Set". This is required to fetch your list statuses and add challenges. Your username is stored locally. When you change or set a username, all existing challenges will attempt to refresh their AniList statuses.</li>
                    <li><strong>➕ Add Challenge:</strong>
                        <ul>
                            <li>Paste your full challenge code (e.g., from an AWC forum post) into the text area.</li>
                            <li>Optionally, add the URL of your forum post for easy reference and linking to the AWC Editor.</li>
                            <li>Click “Save Challenge.” The app will then fetch details for each anime from AniList and compare with your specified AniList account.</li>
                        </ul>
                    </li>
                    <li><strong>❗ Status Parsing from Your Post (Important!):</strong>
                        <ul>
                            <li>The tracker parses status symbols from your challenge post within square brackets. You can define your custom symbols via the "Customize Legend" button (next to "Add Challenge" heading). Default symbols are:
                                <ul>
                                    <li>Completed: <code>[✔️]</code> or <code>[X]</code></li>
                                    <li>Ongoing: <code>[⭐]</code></li>
                                    <li>Incomplete: <code>[❌]</code> or <code>[O]</code></li>
                                </ul>
                            </li>
                            <li><strong>Unicode Note:</strong> Be mindful that some checkmark symbols (like ✔️ or ❌) can have multiple Unicode representations that look identical but are technically different characters. If parsing seems incorrect for a checkmark, ensure you're using the standard emoji version (U+2714 U+FE0F for ✔️). The parser specifically looks for the common variants. So I recommend copy pasting the emoji's seen above into your challenge code and into AWC Editor for simplicity. Or Customizing the legend to your</li>
                        </ul>
                    </li>
                    <li><strong>⏳ Rate Limits & Large Challenges:</strong>
                        <ul>
                            <li>When adding a challenge, the app fetches data for each anime from AniList one by one.</li>
                            <li>To respect AniList's API rate limits, there's a delay between each fetch (currently {ANILIST_API_DELAY_MS / 1000} seconds).</li>
                            <li>This means **adding very large challenges can take some time.**</li>
                        </ul>
                    </li>
                    <li><strong><span role="img" aria-label="books">📚</span> Title Preference:</strong> Use the "Romaji/English" button (bottom-left) to switch title languages.</li>
                    <li><strong>☀️/🌙 Theme Toggle:</strong> Switch between light and dark themes using the sun/moon button in the sidebar.</li>
                    <li><strong><span role="img" aria-label="globe">🌐</span> Global Tracker:</strong> Combined view of all anime from your saved challenges.</li>
                    <li><strong>📋 Manage Challenges:</strong> View progress, copy URL/Code, link to AWC Editor, Delete. Refresh statuses in detail view. Filter and sort options are available above the list.</li>
                     <li><strong>⚠️ Discrepancies:</strong> Highlights if AniList status differs from your post's status.</li>
                     <li><strong>💾 Data Import/Export:</strong> Use the buttons below to backup your current data (challenges and settings) or import data from a previous backup.</li>
                  </ul>
                </Description>
                <div className="dialog-actions data-actions"> 
                  <label htmlFor="import-file-input" className="button-secondary import-button">
                    📥 Import Data
                  </label>
                  <input id="import-file-input" type="file" accept=".json" onChange={handleImportData} style={{ display: 'none' }} />
                  <button onClick={handleExportData} className="button-secondary export-button">📤 Export Data</button>
                </div>
                <div className="dialog-actions">
                  <button className="dialog-clear-all-btn" onClick={handleClearAllData} title="Deletes all data & logs out.">⚠️ Clear All App Data</button>
                  <button className="dialog-close-btn" onClick={() => setIsHelpModalOpen(false)}>Close</button>
                </div>
              </DialogPanel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isLegendModalOpen} as={Fragment}>
        <Dialog as="div" className="dialog-root" onClose={() => setIsLegendModalOpen(false)}>
        <Transition.Child
            as={Fragment}
            enter="dialog-backdrop-enter-active"
            enterFrom="dialog-backdrop-enter-from"
            enterTo="dialog-backdrop-enter-to"
            leave="dialog-backdrop-leave-active"
            leaveFrom="dialog-backdrop-leave-from"
            leaveTo="dialog-backdrop-leave-to"
          >
            <div className="dialog-backdrop" />
          </Transition.Child>
          <div className="dialog-container">
          <Transition.Child
              as={Fragment}
              enter="dialog-panel-enter-active"
              enterFrom="dialog-panel-enter-from"
              enterTo="dialog-panel-enter-to"
              leave="dialog-panel-leave-active"
              leaveFrom="dialog-panel-leave-from"
              leaveTo="dialog-panel-leave-to"
            >
              <DialogPanel className="dialog-panel legend-modal-panel">
                <DialogTitle className="dialog-title">Customize Your Legend Symbols</DialogTitle>
                <Description as="div" className="dialog-description">
                  Define the symbols (case-sensitive) you use in your challenge posts inside square brackets, like <code>[symbol]</code>. You can list multiple symbols for each status. The first symbol you list for each status will be used when this app generates new challenge codes.
                </Description>
                
                <div className="legend-edit-section">
                  {(['complete', 'ongoing', 'incomplete']).map((statusType) => (
                    <div key={statusType} className="legend-status-group">
                      <label htmlFor={`legend-${statusType}-0`}>{statusType.charAt(0).toUpperCase() + statusType.slice(1)} Symbols:</label>
                      {(tempLegend[statusType] && Array.isArray(tempLegend[statusType]) && tempLegend[statusType].length > 0 ? tempLegend[statusType] : ['']).map((symbol, index) => (
                        <div key={index} className="legend-symbol-input-group">
                          <input
                            type="text"
                            id={`legend-${statusType}-${index}`}
                            value={symbol}
                            onChange={(e) => handleLegendInputChange(statusType, index, e.target.value)}
                            placeholder="e.g. ✔️ or X"
                            maxLength={5} 
                          />
                          {tempLegend[statusType] && tempLegend[statusType].length > 0 && (tempLegend[statusType].length > 1 || symbol !== '') && (
                             <button onClick={() => handleRemoveLegendSymbol(statusType, index)} className="remove-symbol-btn" title="Remove symbol">×</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => handleAddLegendSymbol(statusType)} className="add-symbol-btn">➕ Add for {statusType}</button>
                    </div>
                  ))}
                </div>

                <div className="dialog-actions legend-actions">
                  <button className="button-secondary" onClick={() => {setUserLegend(DEFAULT_LEGEND); addToast("Legend reset to defaults.", "info"); setIsLegendModalOpen(false);}}>Reset to Defaults</button>
                  <div>
                    <button className="button-secondary" style={{marginRight: '8px'}} onClick={() => setIsLegendModalOpen(false)}>Cancel</button>
                    <button onClick={saveUserLegend} className="dialog-close-btn">Save Legend</button>
                  </div>
                </div>
              </DialogPanel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>

    </div>
  );
}
export default App;