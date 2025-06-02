import React, { useEffect, useState, Fragment, useMemo } from 'react';
import './App.css';
import awcLogo from './assets/ALAWClogo.png';
import { Description, Dialog, DialogPanel, DialogTitle, Transition  } from '@headlessui/react'
const CLIENT_ID = 27290;
const ANILIST_API_DELAY_MS = 3000;

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
        localStorage.removeItem('awcChallenges'); // Clear corrupted data
        return [];
      }
    }
    return [];
  });
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [copiedChallengeId, setCopiedChallengeId] = useState(null);
  const [copiedUrlId, setCopiedUrlId] = useState(null);
  let [isOpen, setIsOpen] = useState(false);

  const [isAddingChallenge, setIsAddingChallenge] = useState(false);
  const [addChallengeErrors, setAddChallengeErrors] = useState([]);


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
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { Viewer { name avatar { medium } } }`
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.data && data.data.Viewer) {
          setUsername(data.data.Viewer.name);
          setUserAvatar(data.data.Viewer.avatar.medium);
        } else {
          console.error("Failed to fetch user data:", data.errors);
          // Potentially handle token expiry or other auth issues here
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

  const fetchAnime = async (animeId) => {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title { romaji }
          coverImage { medium }
        }
      }
    `;
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: parseInt(animeId) } })
      });
      const json = await response.json();
      if (json.data && json.data.Media) {
        return json.data.Media;
      } else {
        console.warn(`No data for anime ID ${animeId}:`, json.errors || "Unknown reason");
        return null;
      }
    } catch (err) {
      console.warn(`Failed to fetch anime with ID ${animeId}`, err);
      return null;
    }
  };

  const fetchUserAnimeList = async () => {
    if (!username) { // Ensure username is available before fetching list
        console.warn("Username not available for fetching anime list.");
        return { completedIds: new Set(), currentIds: new Set() };
    }
    const query = `
      query ($userName: String) {
        MediaListCollection(userName: $userName, type: ANIME) {
          lists {
            entries {
              mediaId
              status
            }
          }
        }
      }
    `;
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: { userName: username } })
    });
    const json = await response.json();
    if (json.data && json.data.MediaListCollection) {
      const allEntries = json.data.MediaListCollection.lists.flatMap(list => list.entries);
      const completedIds = new Set(allEntries.filter(e => e.status === 'COMPLETED').map(e => e.mediaId));
      const currentIds = new Set(allEntries.filter(e => e.status === 'CURRENT').map(e => e.mediaId));
      return { completedIds, currentIds };
    } else {
      console.error("Failed to fetch user anime list:", json.errors);
      throw new Error("Could not fetch user's anime list from AniList.");
    }
  };

  const handleAddChallenge = async () => {
    if (!rawCode) return;

    setIsAddingChallenge(true);
    setAddChallengeErrors([]);
    const localErrors = [];

    try {
      const lines = rawCode.split('\n').map(line => line.trim());
      const headerLine = lines.find(line => line.startsWith('#'));
      const autoTitle = headerLine ? headerLine.replace(/[#_]/g, '').trim() : `Challenge ${Date.now()}`;

      const entries = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const statusMatch = line.match(/\[(✔️|❌|X|O|⭐)\]/);
        if (statusMatch) {
          const statusSymbol = statusMatch[1];
          const statusChallenge = (statusSymbol === '✔️' || statusSymbol === 'X') ? 'complete'
                                  : (statusSymbol === '⭐') ? 'ongoing'
                                  : 'incomplete'; // Includes ❌ and O
          const titleMatch = line.match(/__(.+?)__/);
          const title = titleMatch ? titleMatch[1] : 'Unknown';
          const urlLine = lines[i + 1] || '';
          const urlMatch = urlLine.match(/anime\/(\d+)/);
          const animeId = urlMatch ? urlMatch[1] : null;
          const datesLine = lines[i + 2] || '';
          const startMatch = datesLine.match(/Start:\s*([\d-]+)/);
          const endMatch = datesLine.match(/Finish:\s*([\d-]+)/);
          if (animeId) {
            entries.push({
              animeId,
              title, // This is title from raw code, usually same as romajiTitle after fetch
              statusChallenge,
              startDate: startMatch ? startMatch[1] : null,
              endDate: endMatch ? endMatch[1] : null
            });
          }
        }
      }

      const { completedIds, currentIds } = token ? await fetchUserAnimeList() : { completedIds: new Set(), currentIds: new Set() };
      const enriched = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        try {
          const info = await fetchAnime(entry.animeId);
          if (!info) {
            localErrors.push(`Could not fetch details for anime ID ${entry.animeId} (Original title: ${entry.title}).`);
            enriched.push(null);
          } else {
            const statusAniList = completedIds.has(parseInt(entry.animeId)) ? 'complete'
                                   : currentIds.has(parseInt(entry.animeId)) ? 'ongoing'
                                   : 'incomplete';
            enriched.push({
              ...entry,
              id: i, // Using index as ID for entries within a challenge
              romajiTitle: info.title.romaji,
              image: info.coverImage.medium,
              statusAniList
            });
          }
        } catch (err) {
          console.warn(`Error processing entry for anime ID ${entry.animeId}`, err);
          localErrors.push(`Error processing anime ID ${entry.animeId}: ${err.message}`);
          enriched.push(null);
        }
        if (i < entries.length - 1) { // Avoid delay after the last item
          await new Promise(res => setTimeout(res, ANILIST_API_DELAY_MS)); // Rate limiting
        }
      }
      
      setAddChallengeErrors(localErrors);

      const filtered = enriched.filter(Boolean);
      if (filtered.length === 0 && entries.length > 0) {
        // All entries failed to process, don't add an empty challenge
        if (localErrors.length === 0) { // If no specific errors, add a generic one
            setAddChallengeErrors(prev => [...prev, "No valid anime entries could be processed from the provided code."]);
        }
        return; // Stop here
      }


      const newChallenge = {
        id: Date.now(),
        title: autoTitle,
        postUrl,
        entries: filtered
      };

      const updated = [...challenges, newChallenge];
      setChallenges(updated);
      localStorage.setItem('awcChallenges', JSON.stringify(updated));
      setRawCode('');
      setPostUrl('');
    } catch (error) {
      console.error("Error adding challenge:", error);
      setAddChallengeErrors(prevErrors => [...prevErrors, `An unexpected error occurred: ${error.message}`]);
    } finally {
      setIsAddingChallenge(false);
    }
  };

  const deleteChallenge = (id) => {
    const updated = challenges.filter(ch => ch.id !== id);
    setChallenges(updated);
    localStorage.setItem('awcChallenges', JSON.stringify(updated));
    if (selectedChallenge?.id === id) setSelectedChallenge(null);
  };

  const generateChallengeCode = (challenge) => {
    const header = `#__${challenge.title}__\n\nChallenge Start Date: YYYY-MM-DD\nChallenge Finish Date: YYYY-MM-DD\nLegend: [✔️] = Completed [❌] = Not Completed [⭐] = Ongoing\n\n<hr>\n`;
    const blocks = challenge.entries.map((entry, i) => {
      // Determine symbol based on AniList status first, then challenge status if not on AniList
      let symbol;
      if (entry.statusAniList === 'complete') {
        symbol = '✔️';
      } else if (entry.statusAniList === 'ongoing') {
        symbol = '⭐';
      } else { // Not on AniList or incomplete on AniList, use challenge status
        if (entry.statusChallenge === 'complete') symbol = '✔️'; // e.g. if manually marked complete
        else if (entry.statusChallenge === 'ongoing') symbol = '⭐';
        else symbol = '❌';
      }
      return `${String(i + 1).padStart(2, '0')}) [${symbol}] __${entry.romajiTitle}__\nhttps://anilist.co/anime/${entry.animeId}/\nStart: ${entry.startDate || 'YYYY-MM-DD'} Finish: ${entry.endDate || 'YYYY-MM-DD'}`;
    });
    return header + blocks.join('\n\n');
  };

  const handleCopyChallengeCode = (challenge) => {
    const text = generateChallengeCode(challenge);
    navigator.clipboard.writeText(text);
    setCopiedChallengeId(challenge.id);
    setTimeout(() => setCopiedChallengeId(null), 2000);
  };

  const handleCopyPostUrl = (challenge) => {
    navigator.clipboard.writeText(challenge.postUrl || '');
    setCopiedUrlId(challenge.id);
    setTimeout(() => setCopiedUrlId(null), 2000);
  };

  const globalAnime = useMemo(() => {
    return challenges
      .flatMap(ch => ch.entries)
      .reduce((acc, anime) => {
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
    // If an anime is in multiple challenges, its "challenge status" for global view:
    // if 'complete' in ANY challenge -> 'complete'
    // else if 'ongoing' in ANY challenge -> 'ongoing'
    // else -> 'incomplete'
    if (anime.challengeStatuses.includes('complete')) return 'complete';
    if (anime.challengeStatuses.includes('ongoing')) return 'ongoing';
    return 'incomplete';
  }


  const renderChallengeDetail = (challenge) => (
    <div>
      <button className="back-button" onClick={() => setSelectedChallenge(null)}>⬅️ Back</button>
      <h2>{challenge.title}</h2>
      {challenge.postUrl && <p>Post URL: <a href={challenge.postUrl} target="_blank" rel="noreferrer">{challenge.postUrl}</a></p>}
      <ul>
        {challenge.entries.map((entry) => (
          <li key={entry.id}>
            <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer">
              <img src={entry.image} alt={entry.romajiTitle} />
            </a>
            <div>
              <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer">
                <strong>{entry.romajiTitle}</strong>
              </a><br />
              AniList: {entry.statusAniList === 'complete' ? '✅' : entry.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge: {entry.statusChallenge === 'complete' ? '✅' : entry.statusChallenge === 'ongoing' ? '⭐' : '❌'}
              {entry.statusAniList === 'complete' && entry.statusChallenge === 'incomplete' && (
                <div style={{color: '#facc15'}}>⚠️ Needs post update (mark as ✔️ in challenge)</div>
              )}
               {entry.statusAniList === 'incomplete' && entry.statusChallenge === 'complete' && (
                <div style={{color: '#60a5fa'}}>ℹ️ Marked complete in challenge, but not on AniList.</div>
              )}
              <div>
                Start: {entry.startDate || '—'} | Finish: {entry.endDate || '—'}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="App">
      <div className="sidebar">
        <h1 style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setSelectedChallenge(null)}>
            <img src={awcLogo} alt="AWC Logo"
              style={{
                width: 80,
                height: 127,
                marginRight: 8,
                objectFit: 'contain'
              }}
            />
            AWC Tracker
          </h1>
        {!token ? (
          <button onClick={loginAniList}>🔑 Login with AniList</button>
        ) : username ? (
          <a href={`https://anilist.co/user/${username}`} target="_blank" rel="noreferrer" className="profile-display">
            <img className="avatar" src={userAvatar} alt="Avatar" />
            <span>{username}</span>
          </a>
        ) : (
            <p>Loading user...</p>
        )}
        <h3>Saved Challenges</h3>
        <ul>
          {challenges.map(ch => (
            <li key={ch.id} onClick={() => setSelectedChallenge(ch)} style={{ cursor: 'pointer' }}>
              <strong>{ch.title}</strong>
            </li>
          ))}
        </ul>
        <button className="help-button" onClick={() => setIsOpen(true)}>❓ Help</button>
      </div>

      <div className="main">
        {!selectedChallenge ? (
          <>
            <h2>➕ Add Challenge</h2>
            <textarea
              value={rawCode}
              onChange={(e) => setRawCode(e.target.value)}
              rows={8}
              placeholder="Paste challenge code here (e.g., from an AWC forum post)"
            />
            <input
              type="text"
              placeholder="Optional: Forum post URL (for this challenge)"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
            />
            <button onClick={handleAddChallenge} disabled={isAddingChallenge}>
              {isAddingChallenge ? '⏳ Adding...' : '➕ Save Challenge'}
            </button>

            {addChallengeErrors.length > 0 && (
              <div className="challenge-add-errors">
                <h4>Encountered issues while adding:</h4>
                {addChallengeErrors.map((err, i) => <p key={i}>{err}</p>)}
              </div>
            )}

            <h2>📊 Global Tracker</h2>
            {Object.keys(globalAnime).length === 0 && challenges.length > 0 && <p>No anime found in current challenges, or data is still processing.</p>}
            {challenges.length === 0 && <p>Add some challenges to see the global tracker.</p>}
            
            <ul>
              {Object.values(globalAnime).map(anime => {
                const effectiveChallengeStatus = getEffectiveChallengeStatus(anime);
                return (
                  <li key={anime.animeId}>
                    <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer">
                      <img src={anime.image} alt={anime.romajiTitle} />
                    </a>
                    <div>
                      <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer">
                        <strong>{anime.romajiTitle}</strong>
                      </a><br />
                      AniList: {anime.statusAniList === 'complete' ? '✅' : anime.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge(s): {effectiveChallengeStatus === 'complete' ? '✅' : effectiveChallengeStatus === 'ongoing' ? '⭐' : '❌'}
                      {anime.statusAniList === 'complete' && effectiveChallengeStatus === 'incomplete' && (
                        <div style={{color: '#facc15'}}>⚠️ Needs post update in at least one challenge</div>
                      )}
                       {anime.statusAniList === 'incomplete' && effectiveChallengeStatus === 'complete' && (
                        <div style={{color: '#60a5fa'}}>ℹ️ Marked complete in a challenge, but not on AniList.</div>
                      )}
                      {anime.count > 1 && (
                        <div>🔁 In {anime.count} challenges</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          renderChallengeDetail(selectedChallenge)
        )}
      </div>

      <div className="rightbar">
        <h2>📋 Manage</h2>
        {challenges.length === 0 && <p>No challenges added yet.</p>}
        <ul>
          {challenges.map((ch) => {
            const completedOnAniList = ch.entries.filter((e) => e.statusAniList === 'complete').length;
            const total = ch.entries.length;
            return (
              <li key={ch.id}>
                <div>
                  <strong>{ch.title}</strong><br />
                  AniList ✅: {completedOnAniList}/{total}
                  <div className="button-row">
                    <button onClick={() => handleCopyPostUrl(ch)} disabled={!ch.postUrl}>
                      {copiedUrlId === ch.id ? '✅ Post URL' : '🔗 Copy URL'}
                    </button>
                    <button onClick={() => handleCopyChallengeCode(ch)}>
                      {copiedChallengeId === ch.id ? '✅ Code' : '📋 Copy Code'}
                    </button>
                  </div>
                  {ch.postUrl && (
                    <div className="awc-link">
                      <a href={`https://awc.moe/challenges/editor?url=${encodeURIComponent(ch.postUrl)}`} target="_blank" rel="noreferrer">
                        🌐 AWC Editor
                      </a>
                    </div>
                  )}
                </div>
                <button onClick={() => deleteChallenge(ch.id)} title="Delete Challenge">🗑️</button>
              </li>
            );
          })}
        </ul>
        
      </div>

      <Transition appear={true} show={isOpen} as={Fragment}>
        <Dialog as="div" className="dialog-root" onClose={() => setIsOpen(false)}>
          <Transition
            show={isOpen}
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-30" // This applies to backdrop
            leave="ease-in duration-150"
            leaveFrom="opacity-30"
            leaveTo="opacity-0"
          >
            <div className="dialog-backdrop" aria-hidden="true" />
          </Transition>
          <div className="dialog-container">
            <Transition
              show={isOpen}
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="dialog-panel">
                <DialogTitle className="dialog-title">
                  How to Use AWC Tracker
                </DialogTitle>
                <Description as="div" className="dialog-description">
                  <ul className="dialog-list">
                    <li>🔑 Click “Login with AniList” to connect your account. This allows the tracker to check your anime list statuses.</li>
                    <li>➕ Paste your challenge code (from AWC forum posts) into the text area. Optionally add the forum post URL. Click “Save Challenge.”</li>
                    <li>📊 The "Global Tracker" shows all anime from your saved challenges, indicating their status on AniList vs. in your challenges.</li>
                    <li>📋 In the "Manage" section, for each challenge:
                        <ul>
                            <li>Copy the post URL (if you added one).</li>
                            <li>Copy an updated challenge code to paste back into forums. The code uses your current AniList statuses.</li>
                            <li>Link to AWC Editor (if post URL is provided).</li>
                            <li>Delete a challenge.</li>
                        </ul>
                    </li>
                    <li>🗒️ Challenge Parsing:
                        <ul>
                            <li>Titles are best parsed if they start with `#` (e.g. `# My Challenge`).</li>
                            <li>Entry format: `[STATUS] __Anime Title__`, then `https://anilist.co/anime/ID/` on the next line, then optional `Start: YYYY-MM-DD` and `Finish: YYYY-MM-DD` on the line after.</li>
                            <li>Use status symbols: [✔️] for completed, [❌] for not completed (incomplete), [⭐] for ongoing.</li>
                        </ul>
                    </li>
                     <li>⚠️ If an anime is "complete" on AniList but "incomplete" in your challenge (e.g. [❌]), it will be flagged to remind you to update your challenge post.</li>
                  </ul>
                </Description>
                <div className="dialog-actions">
                  <button className="dialog-close-btn" onClick={() => setIsOpen(false)}>
                    Close
                  </button>
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