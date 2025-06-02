import React, { useEffect, useState, Fragment, useMemo } from 'react';
import './App.css';
import awcLogo from './assets/ALAWClogo.png';
import { Description, Dialog, DialogPanel, DialogTitle, Transition  } from '@headlessui/react';


const CLIENT_ID = process.env.REACT_APP_ANILIST_CLIENT_ID ; 
const ANILIST_API_DELAY_MS = parseInt(process.env.REACT_APP_ANILIST_API_DELAY_MS, 10) || 4000;


const EmptyState = ({ message, subMessage }) => (
  <div className="empty-state-container">
    <p className="empty-state-message">{message}</p>
    {subMessage && <p className="empty-state-submessage">{subMessage}</p>}
  </div>
);


const Toast = ({ message, type = 'success', onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast toast-${type}`}>
      {message}
      <button onClick={onDismiss} className="toast-dismiss-btn">×</button>
    </div>
  );
};


function App() {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);
  const [userAvatar, setUserAvatar] = useState(null);
  const [rawCode, setRawCode] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [challenges, setChallenges] = useState(() => {
    const saved = localStorage.getItem('awcChallenges');
    if (saved) { 
      try { 
        return JSON.parse(saved); 
      } catch (error) { 
        console.error("Failed to parse challenges from localStorage:", error); 
        localStorage.removeItem('awcChallenges'); 
        return []; 
      } 
    }
    return [];
  });
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  let [isOpen, setIsOpen] = useState(false);

  const [isAddingChallenge, setIsAddingChallenge] = useState(false);
  const [addChallengeErrors, setAddChallengeErrors] = useState([]);
  
  const [toasts, setToasts] = useState([]);
  const [isRefreshingChallenge, setIsRefreshingChallenge] = useState(false);

  const [preferredTitle, setPreferredTitle] = useState(() => {
    return localStorage.getItem('preferredTitle') || 'romaji';
  });

  useEffect(() => {
    localStorage.setItem('preferredTitle', preferredTitle);
  }, [preferredTitle]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const accessToken = new URLSearchParams(hash.substring(1)).get('access_token');
      if (accessToken) {
        setToken(accessToken); 
        localStorage.setItem('accessToken', accessToken); 
        window.location.hash = '';
      }
    } else { 
      const stored = localStorage.getItem('accessToken'); 
      if (stored) setToken(stored); 
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query { Viewer { name avatar { medium } } }` })
    })
    .then(res => res.json())
    .then(data => {
      if (data.data && data.data.Viewer) { 
        setUsername(data.data.Viewer.name); 
        setUserAvatar(data.data.Viewer.avatar.medium); 
      } else { 
        console.error("Failed to fetch user data:", data.errors); 
      }
    })
    .catch(err => { 
      console.error("Error fetching user data:", err); 
    });
  }, [token]);

  const loginAniList = () => {
    const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${CLIENT_ID}&response_type=token`;
    window.location.href = authUrl;
  };
  
  const getDisplayTitle = (entry) => {
    if (!entry) return 'Unknown Title';
    if (preferredTitle === 'english' && entry.englishTitle) {
      return entry.englishTitle;
    }
    return entry.romajiTitle || 'Unknown Title';
  };

  const fetchAnime = async (animeId) => {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title { 
            romaji 
            english 
          }
          coverImage { medium }
        }
      }
    `;
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: parseInt(animeId) } })
      });
      const json = await response.json();
      if (!response.ok) {
        let errorMsg = `API request for ID ${animeId} failed with status ${response.status}.`;
        if (json && json.errors && json.errors.length > 0) { errorMsg += ` Details: ${json.errors.map(e => e.message).join(', ')}`; }
        console.warn(errorMsg); return { error: errorMsg };
      }
      if (json.data && json.data.Media) { 
        return json.data.Media;
      } else {
        let errorDetail = "Unknown reason"; if (json && json.errors && json.errors.length > 0) { errorDetail = json.errors.map(e => e.message).join(', '); }
        console.warn(`No data for anime ID ${animeId}: ${errorDetail}`); return { error: `No data for ID ${animeId}: ${errorDetail}` };
      }
    } catch (err) {
      console.warn(`Network error fetching anime ID ${animeId}:`, err.message);
      return { error: `Network error fetching ID ${animeId}: ${err.message}` };
    }
  };

  const fetchUserAnimeList = async () => {
    if (!username) { console.warn("Username not available for fetching anime list."); return { completedIds: new Set(), currentIds: new Set() }; }
    const query = `query ($userName: String) { MediaListCollection(userName: $userName, type: ANIME) { lists { entries { mediaId status } } } }`;
    try {
        const response = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { userName: username } })
        });
        const json = await response.json();
        if (!response.ok || (json.errors && json.errors.length > 0)) {
            const errorMessages = json.errors ? json.errors.map(e => e.message).join(', ') : `Status ${response.status}`;
            console.error("Failed to fetch user anime list:", errorMessages);
            addToast(`Error fetching your AniList: ${errorMessages}`, 'error');
            return { completedIds: new Set(), currentIds: new Set(), error: true };
        }
        if (json.data && json.data.MediaListCollection) {
        const allEntries = json.data.MediaListCollection.lists.flatMap(list => list.entries);
        const completedIds = new Set(allEntries.filter(e => e.status === 'COMPLETED').map(e => e.mediaId));
        const currentIds = new Set(allEntries.filter(e => e.status === 'CURRENT').map(e => e.mediaId));
        return { completedIds, currentIds };
        }
    } catch (error) {
        console.error("Network error fetching user anime list:", error);
        addToast(`Network error fetching your AniList: ${error.message}`, 'error');
        return { completedIds: new Set(), currentIds: new Set(), error: true };
    }
    return { completedIds: new Set(), currentIds: new Set(), error: true };
  };

  const handleAddChallenge = async () => {
    if (!rawCode) return;
    setIsAddingChallenge(true); setAddChallengeErrors([]); const localErrors = [];
    try {
      const lines = rawCode.split('\n').map(line => line.trim());
      const headerLine = lines.find(line => line.startsWith('#'));
      const autoTitle = headerLine ? headerLine.replace(/[#_]/g, '').trim() : `Challenge ${Date.now()}`;
      const entries = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; const statusMatch = line.match(/\[(✔️|❌|X|O|⭐)\]/);
        if (statusMatch) {
          const statusSymbol = statusMatch[1]; const statusChallenge = (statusSymbol === '✔️' || statusSymbol === 'X') ? 'complete' : (statusSymbol === '⭐') ? 'ongoing' : 'incomplete';
          const titleMatch = line.match(/__(.+?)__/); 
          const titleFromPost = titleMatch ? titleMatch[1] : 'Unknown';
          const urlLine = lines[i + 1] || ''; const urlMatch = urlLine.match(/anime\/(\d+)/); const animeId = urlMatch ? urlMatch[1] : null;
          const datesLine = lines[i + 2] || ''; const startMatch = datesLine.match(/Start:\s*([\d-]+)/); const endMatch = datesLine.match(/Finish:\s*([\d-]+)/);
          if (animeId) { entries.push({ animeId, title: titleFromPost, statusChallenge, startDate: startMatch ? startMatch[1] : null, endDate: endMatch ? endMatch[1] : null }); }
        }
      }
      const userList = token ? await fetchUserAnimeList() : { completedIds: new Set(), currentIds: new Set() };
      if (userList.error && token) { localErrors.push("Could not verify your AniList statuses. Challenge statuses might be based on post data only."); }
      
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
          enriched.push({ 
            ...entry, id: i, romajiTitle: info.title.romaji, englishTitle: info.title.english,
            image: info.coverImage.medium, statusAniList 
          });
        }
        if (i < entries.length - 1) { await new Promise(res => setTimeout(res, ANILIST_API_DELAY_MS)); }
      }
      setAddChallengeErrors(localErrors);
      const filtered = enriched.filter(Boolean);
      if (filtered.length === 0 && entries.length > 0) {
        if (localErrors.length === 0) { setAddChallengeErrors(prev => [...prev, "No valid anime entries processed."]); }
        addToast("No valid anime entries could be processed from the provided code.", 'warning');
        setIsAddingChallenge(false); 
        return;
      }
      const newChallenge = { id: Date.now(), title: autoTitle, postUrl, entries: filtered };
      const updated = [...challenges, newChallenge];
      setChallenges(updated); localStorage.setItem('awcChallenges', JSON.stringify(updated));
      setRawCode(''); setPostUrl(''); addToast(`Challenge "${autoTitle}" added!`, 'success');
    } catch (error) {
      console.error("Error adding challenge:", error);
      setAddChallengeErrors(prevErrors => [...prevErrors, `Unexpected error: ${error.message}`]);
      addToast("Failed to add challenge.", 'error');
    } finally { setIsAddingChallenge(false); }
  };

  const deleteChallenge = (id) => {
    const challengeToDelete = challenges.find(ch => ch.id === id);
    if (window.confirm(`Delete challenge "${challengeToDelete?.title || 'this'}"? This action cannot be undone.`)) {
      const updated = challenges.filter(ch => ch.id !== id);
      setChallenges(updated); localStorage.setItem('awcChallenges', JSON.stringify(updated));
      if (selectedChallenge?.id === id) setSelectedChallenge(null);
      addToast(`Challenge "${challengeToDelete?.title || 'Selected'}" deleted.`, 'info');
    }
  };

  const generateChallengeCode = (challenge) => {
    const header = `#__${challenge.title}__\n\nChallenge Start Date: YYYY-MM-DD\nChallenge Finish Date: YYYY-MM-DD\nLegend: [✔️] = Completed [❌] = Not Completed [⭐] = Ongoing\n\n<hr>\n`;
    const blocks = challenge.entries.map((entry, i) => {
      let symbol;
      if (entry.statusAniList === 'complete') symbol = '✔️';
      else if (entry.statusAniList === 'ongoing') symbol = '⭐';
      else {
        if (entry.statusChallenge === 'complete') symbol = '✔️';
        else if (entry.statusChallenge === 'ongoing') symbol = '⭐';
        else symbol = '❌';
      }
      const displayTitleForCode = getDisplayTitle(entry);
      return `${String(i + 1).padStart(2, '0')}) [${symbol}] __${displayTitleForCode}__\nhttps://anilist.co/anime/${entry.animeId}/\nStart: ${entry.startDate || 'YYYY-MM-DD'} Finish: ${entry.endDate || 'YYYY-MM-DD'}`;
    });
    return header + blocks.join('\n\n');
  };

  const handleCopyChallengeCode = (challenge) => {
    navigator.clipboard.writeText(generateChallengeCode(challenge));
    addToast("Challenge code copied!", 'success');
  };

  const handleCopyPostUrl = (challenge) => {
    navigator.clipboard.writeText(challenge.postUrl || '');
    addToast("Post URL copied!", 'success');
  };

  const handleRefreshChallengeStatus = async (challengeId) => {
    if (!token) { addToast("Please login with AniList to refresh statuses.", 'error'); return; }
    const challengeToRefresh = challenges.find(ch => ch.id === challengeId);
    if (!challengeToRefresh) { addToast("Challenge not found.", 'error'); return; }

    setIsRefreshingChallenge(true);
    addToast(`Refreshing AniList statuses for "${challengeToRefresh.title}"...`, 'info');

    const userList = await fetchUserAnimeList();
    if (userList.error) {
        setIsRefreshingChallenge(false);
        return;
    }

    const updatedEntries = challengeToRefresh.entries.map(entry => {
        const newStatusAniList = userList.completedIds.has(parseInt(entry.animeId)) ? 'complete'
                               : userList.currentIds.has(parseInt(entry.animeId)) ? 'ongoing'
                               : 'incomplete';
        return { ...entry, statusAniList: newStatusAniList };
    });
    
    await new Promise(res => setTimeout(res, 200 * Math.min(challengeToRefresh.entries.length, 5) )); 
    
    const updatedChallenges = challenges.map(ch => 
      ch.id === challengeId ? { ...ch, entries: updatedEntries } : ch
    );
    setChallenges(updatedChallenges);
    localStorage.setItem('awcChallenges', JSON.stringify(updatedChallenges));
    
    if (selectedChallenge?.id === challengeId) {
        setSelectedChallenge(updatedChallenges.find(ch => ch.id === challengeId));
    }

    setIsRefreshingChallenge(false);
    addToast(`AniList statuses for "${challengeToRefresh.title}" refreshed successfully!`, 'success');
  };

  const globalAnime = useMemo(() => {
    return challenges
      .flatMap(ch => ch.entries)
      .reduce((acc, anime) => {
        if (!anime || anime.animeId === undefined) return acc;
        if (!acc[anime.animeId]) {
          acc[anime.animeId] = { ...anime, count: 1, challengeStatuses: [anime.statusChallenge] };
        } else {
          acc[anime.animeId].count += 1;
          acc[anime.animeId].challengeStatuses.push(anime.statusChallenge);
        }
        return acc;
      }, {});
  }, [challenges]);

  const getEffectiveChallengeStatus = (anime) => {
    if (!anime || !anime.challengeStatuses) return 'incomplete'; 
    if (anime.challengeStatuses.includes('complete')) return 'complete';
    if (anime.challengeStatuses.includes('ongoing')) return 'ongoing';
    return 'incomplete';
  };
  
  const renderChallengeDetail = (challenge) => (
    <div>
      <button className="back-button" onClick={() => setSelectedChallenge(null)}>⬅️ Back</button>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
        <h2>{challenge.title}</h2>
        {token && ( <button onClick={() => handleRefreshChallengeStatus(challenge.id)} disabled={isRefreshingChallenge} className="refresh-challenge-btn"> {isRefreshingChallenge ? '🔄 Refreshing...' : '🔄 Refresh AniList Status'} </button> )}
      </div>
      {challenge.postUrl && <p>Post URL: <a href={challenge.postUrl} target="_blank" rel="noreferrer">{challenge.postUrl}</a></p>}
      {challenge.entries.length === 0 ? ( <EmptyState message="This challenge has no anime entries." subMessage="It might have been added with invalid data or all entries failed to process."/> ) : (
        <ul> {challenge.entries.map((entry) => ( 
            <li key={entry.id}> 
                <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer"> 
                    <img src={entry.image} alt={getDisplayTitle(entry)} />
                </a> 
                <div> 
                    <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer"> 
                        <strong>{getDisplayTitle(entry)}</strong>
                    </a><br /> 
                    AniList: {entry.statusAniList === 'complete' ? '✅' : entry.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge: {entry.statusChallenge === 'complete' ? '✅' : entry.statusChallenge === 'ongoing' ? '⭐' : '❌'} 
                    {entry.statusAniList === 'complete' && entry.statusChallenge === 'incomplete' && ( <div style={{color: '#facc15'}}>⚠️ Needs post update (mark as ✔️ or X in challenge)</div> )} 
                    {entry.statusAniList === 'incomplete' && entry.statusChallenge === 'complete' && ( <div style={{color: '#60a5fa'}}>ℹ️ Marked complete in challenge, but not on AniList.</div> )} 
                    <div> Start: {entry.startDate || '—'} | Finish: {entry.endDate || '—'} </div> 
                </div> 
            </li> 
        ))} </ul>
      )}
    </div>
  );

  const handleClearAllData = () => {
    if (window.confirm("ARE YOU ABSOLUTELY SURE?\n\nThis will delete ALL saved challenges and log you out from AniList within this app.\nThis action CANNOT be undone.")) {
      if (window.confirm("SECOND CONFIRMATION:\n\nReally delete all data? There's no going back!")) {
        localStorage.removeItem('awcChallenges'); localStorage.removeItem('accessToken');
        setChallenges([]); setToken(null); setUsername(null); setUserAvatar(null);
        setSelectedChallenge(null); setRawCode(''); setPostUrl(''); setAddChallengeErrors([]);
        setIsOpen(false); addToast("All app data has been cleared.", 'info');
      }
    }
  };

  return (
    <div className="App">
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} message={toast.message} type={toast.type} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
      <div className="sidebar">
        <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', marginBottom: '1rem' }} onClick={() => setSelectedChallenge(null)} className="app-title-container" >
            <img src={awcLogo} alt="AWC Logo" style={{ width: 80, height: 127, marginRight: 8, objectFit: 'contain' }} />
            <span className="app-title-text">AWC Tracker</span> 
        </div>
        {!token ? ( <button onClick={loginAniList}>🔑 Login with AniList</button>
        ) : username ? ( <a href={`https://anilist.co/user/${username}`} target="_blank" rel="noreferrer" className="profile-display"> <img className="avatar" src={userAvatar} alt="Avatar" /> <span>{username}</span> </a>
        ) : ( <p className="loading-user-text">Loading user...</p> )}

        <h3>Saved Challenges</h3>
        {challenges.length === 0 ? ( <EmptyState message="No challenges saved yet." subMessage="Add one using the form in the main panel." />
        ) : ( <ul> {challenges.map(ch => ( <li key={ch.id} onClick={() => setSelectedChallenge(ch)} className={`sidebar-challenge-item ${selectedChallenge?.id === ch.id ? 'selected' : ''}`}> <strong>{ch.title}</strong> </li> ))} </ul>
        )}
        
        <div className="sidebar-bottom-controls">
            <button className="help-button" onClick={() => setIsOpen(true)}>❓ Help</button>
            <button 
                onClick={() => setPreferredTitle(preferredTitle === 'romaji' ? 'english' : 'romaji')}
                className={`title-toggle-button ${preferredTitle === 'romaji' ? 'toggle-active-romaji' : 'toggle-active-english'}`}
                title={`Current display: ${preferredTitle}. Click to switch.`}
            >
                {preferredTitle === 'romaji' ? 'English' : 'Romaji'}
            </button>
        </div>
      </div>

      <div className="main">
        {!selectedChallenge ? (
          <>
            <h2>➕ Add Challenge</h2>
            <textarea value={rawCode} onChange={(e) => setRawCode(e.target.value)} rows={8} placeholder="Paste challenge code here (e.g., from an AWC forum post)" />
            <input type="text" placeholder="Optional: Forum post URL (for this challenge)" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
            <button onClick={handleAddChallenge} disabled={isAddingChallenge}> {isAddingChallenge ? '⏳ Adding...' : '➕ Save Challenge'} </button>
            {addChallengeErrors.length > 0 && ( <div className="challenge-add-errors"> <h4>Encountered issues while adding:</h4> {addChallengeErrors.map((err, i) => <p key={i} className="error-item">{err}</p>)} </div> )}
            
            <h2>📊 Global Tracker</h2>
            {challenges.length === 0 && Object.keys(globalAnime).length === 0 ? ( <EmptyState message="No challenges added." subMessage="Add some challenges to see the global tracker." />
            ) : Object.keys(globalAnime).length === 0 && challenges.length > 0 ? ( <EmptyState message="No anime found in current challenges." subMessage="Entries might be processing or challenges are empty." />
            ) : ( 
                <ul> 
                    {Object.values(globalAnime).map(anime => { 
                        if (!anime || anime.animeId === undefined) return null; 
                        const effectiveChallengeStatus = getEffectiveChallengeStatus(anime); 
                        const displayTitle = getDisplayTitle(anime); 
                        return ( 
                            <li key={anime.animeId}> 
                                <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer"> 
                                    <img src={anime.image} alt={displayTitle} />
                                </a> 
                                <div> 
                                    <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer"> 
                                        <strong>{displayTitle}</strong>
                                    </a><br /> 
                                    AniList: {anime.statusAniList === 'complete' ? '✅' : anime.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge(s): {effectiveChallengeStatus === 'complete' ? '✅' : effectiveChallengeStatus === 'ongoing' ? '⭐' : '❌'} 
                                    {anime.statusAniList === 'complete' && effectiveChallengeStatus === 'incomplete' && ( <div style={{color: '#facc15'}}>⚠️ Needs post update</div> )} 
                                    {anime.statusAniList === 'incomplete' && effectiveChallengeStatus === 'complete' && ( <div style={{color: '#60a5fa'}}>ℹ️ Marked complete in challenge</div> )} 
                                    {anime.count > 1 && ( <div>🔁 In {anime.count} challenges</div> )} 
                                </div> 
                            </li> 
                        ); 
                    })} 
                </ul>
            )}
          </>
        ) : ( renderChallengeDetail(selectedChallenge) )}
      </div>

      <div className="rightbar">
        <h2>📋 Manage</h2>
        {challenges.length === 0 ? ( <EmptyState message="No challenges to manage." subMessage="Add challenges first."/>
        ) : ( <ul> {challenges.map((ch) => { const completedOnAniList = ch.entries.filter((e) => e.statusAniList === 'complete').length; const total = ch.entries.length; return ( <li key={ch.id}> <div> <strong>{ch.title}</strong><br /> AniList ✅: {completedOnAniList}/{total} <div className="button-row"> <button onClick={() => handleCopyPostUrl(ch)} disabled={!ch.postUrl}>🔗 Copy URL</button> <button onClick={() => handleCopyChallengeCode(ch)}>📋 Copy Code</button> </div> {ch.postUrl && ( <div className="awc-link"> <a href={`https://awc.moe/challenges/editor?url=${encodeURIComponent(ch.postUrl)}`} target="_blank" rel="noreferrer"> 🌐 AWC Editor </a> </div> )} </div> <button onClick={() => deleteChallenge(ch.id)} title="Delete Challenge">🗑️</button> </li> ); })} </ul>
        )}
      </div>
      
      <Transition appear={true} show={isOpen} as={Fragment}>
        <Dialog as="div" className="dialog-root" onClose={() => setIsOpen(false)}>
          <Transition show={isOpen} as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-30" leave="ease-in duration-150" leaveFrom="opacity-30" leaveTo="opacity-0">
            <div className="dialog-backdrop" aria-hidden="true" />
          </Transition>
          <div className="dialog-container">
            <Transition show={isOpen} as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
            <DialogPanel className="dialog-panel">
                <DialogTitle className="dialog-title">How to Use AWC Tracker</DialogTitle>
                <Description as="div" className="dialog-description">
                  <p>This tool helps you track your Anime Watching Challenge (AWC) progress by parsing your forum posts and comparing them with your AniList activity.</p>
                  <ul className="dialog-list">
                    <li><strong>🔑 Login with AniList:</strong> Click “Login with AniList” to connect your account. This allows the tracker to check your current anime list statuses on AniList. Your token is stored locally in your browser.</li>
                    <li><strong>➕ Add Challenge:</strong>
                        <ul>
                            <li>Paste your full challenge code (e.g., from an AWC forum post) into the text area.</li>
                            <li>Optionally, add the URL of your forum post for easy reference and linking to the AWC Editor.</li>
                            <li>Click “Save Challenge.” The app will then fetch details for each anime from AniList.</li>
                        </ul>
                    </li>
                    <li><strong>❗ Status Parsing from Your Post (Important!):</strong>
                        <ul>
                            <li>The tracker parses status symbols from your challenge post within square brackets. Supported symbols and their interpretation:
                                <ul>
                                    <li><code>[✔️]</code> or <code>[X]</code> (uppercase X): Parsed as 'Completed'</li>
                                    <li><code>[⭐]</code>: Parsed as 'Ongoing'</li>
                                    <li><code>[❌]</code> or <code>[O]</code> (uppercase O): Parsed as 'Incomplete' / 'Not Completed'</li>
                                </ul>
                            </li>
                            <li>For best visual consistency and clarity in your posts, using the emoji symbols (✔️, ❌, ⭐) is recommended, but the letter alternatives (X, O) will also be correctly processed by this tracker as described above.</li>
                        </ul>
                    </li>
                    <li><strong>⏳ Rate Limits & Large Challenges:</strong>
                        <ul>
                            <li>When adding a challenge, the app fetches data for each anime from AniList one by one.</li>
                            <li>To respect AniList's API rate limits (especially when they are in a degraded state), there's a delay between each fetch.</li>
                            <li>This means **adding very large challenges can take some time.** Please be patient; the "Adding..." button indicates it's working.</li>
                            <li>If AniList is under heavy load or if you add many challenges quickly, you might still encounter fetching issues. Trying again later or ensuring a stable internet connection can help.</li>
                        </ul>
                    </li>
                    <li><strong><span role="img" aria-label="books">📚</span> Title Preference:</strong> Use the "English/Romaji" button in the bottom-left of the sidebar to switch between title languages throughout the app. Your preference is saved.</li>
                    <li><strong>📊 Global Tracker:</strong> View a combined list of all anime from your saved challenges. It shows the status on AniList versus the effective status across your challenges.</li>
                    <li><strong>📋 Manage Challenges:</strong>
                        <ul>
                            <li>Click on a saved challenge in the sidebar to view its details.</li>
                            <li>In the right "Manage" panel, for each challenge:
                                <ul>
                                    <li>Copy the post URL (if you added one).</li>
                                    <li>Copy an updated challenge code (uses your preferred title display) to paste back into forums. This generated code uses your *current AniList statuses* to suggest the symbols (✔️, ⭐, ❌).</li>
                                    <li>Link to the AWC Editor (if a post URL is provided).</li>
                                    <li>Delete a challenge (you will be asked to confirm).</li>
                                </ul>
                            </li>
                            <li>When viewing a challenge's details, you can click "Refresh AniList Status" to update its entries based on your current AniList activity (requires login).</li>
                        </ul>
                    </li>
                     <li><strong>⚠️ Discrepancies:</strong> If an anime is marked "complete" (✅) on AniList but still shows as "incomplete" (❌) in your challenge (e.g., your post used `[O]` or `[❌]`), the tracker will highlight this, reminding you to update your forum post with a 'completed' symbol like `[✔️]` or `[X]`.</li>
                  </ul>
                </Description>
                <div className="dialog-actions">
                  <button className="dialog-clear-all-btn" onClick={handleClearAllData} title="Deletes all saved challenges and logs you out.">⚠️ Clear All App Data</button>
                  <button className="dialog-close-btn" onClick={() => setIsOpen(false)}>Close</button>
                </div>
              </DialogPanel>
            </Transition>
          </div>
        </Dialog>
      </Transition>
  </div>
);
}
export default App;