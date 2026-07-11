import './style.css'
import './auth.css'
import { initAuth } from './auth.js'
import { io } from 'socket.io-client';
export let socket;

document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : window.location.origin;

  initAuth();

  socket = io(API_URL);
  
  const storedUserStr = localStorage.getItem('invibeUser');
  if (storedUserStr) {
    try {
      const user = JSON.parse(storedUserStr);
      socket.emit('register', user._id || user.id);
    } catch(e) {}
  }

  window.pendingCandidates = [];

  socket.on('incoming-call', (data) => {
    // data has { callerId, callerName, callerAvatar, offer, isAudioOnly }
    showIncomingCallModal(data);
  });
  
  socket.on('call-accepted', async (data) => {
    if (peerConnection) {
      const answerDesc = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(answerDesc);
      console.log('[WebRTC] Remote answer set successfully via socket');
      
      if (window.pendingCandidates.length > 0) {
        window.pendingCandidates.forEach(cand => {
          try { peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch(e){}
        });
        window.pendingCandidates = [];
      }
      
      // UI transition
      document.getElementById('video-call-outgoing-screen').style.display = 'none';
      document.getElementById('video-call-active-screen').style.display = 'block';
      document.getElementById('video-call-controls').style.display = 'block';
      startVideoCallTimer();
      stopAudioFeedback();
    }
  });
  
  socket.on('call-declined', () => {
    showToast('Call Declined. 📞');
    playCallEndBeep();
    endVideoCallLocally();
  });
  
  socket.on('call-ended', () => {
    showToast('Call Ended.');
    playCallEndBeep();
    endVideoCallLocally();
  });
  
  socket.on('ice-candidate', (data) => {
    if (peerConnection && peerConnection.remoteDescription) {
      peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e=>console.error(e));
    } else {
      window.pendingCandidates.push(data.candidate);
    }
  });

  async function fetchTurnCredentials() {
    try {
      const res = await fetch(`${API_URL}/api/turn-credentials`);
      if (res.ok) {
        const token = await res.json();
        return { iceServers: token.iceServers };
      }
    } catch (e) {
      console.error("TURN fetch error", e);
    }
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }
  
  // Initialize Lucide Icons (Debounced for performance)
  let iconRenderQueued = false;
  const debouncedCreateIcons = () => {
    if (!window.lucide || iconRenderQueued) return;
    iconRenderQueued = true;
    requestAnimationFrame(() => {
      if (window.lucide) window.lucide.createIcons();
      iconRenderQueued = false;
    });
  };
  window.debouncedCreateIcons = debouncedCreateIcons;

  debouncedCreateIcons();

  // --- STATE SYSTEM ---
  const state = {
    theme: 'dark',
    activeView: 'home',
    currentChatThread: null,
    chatMode: 'chat', // chat, watch, call, game, media
    callTimerInterval: null,
    callSeconds: 1455, // starts at 00:24:15
    isLiked: {
      post1: false,
      post2: false
    },
    likesCount: {
      post1: 12400,
      post2: 8200
    },
    stories: [
      { name: "Alex Rivers", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80", img: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80", time: "2 hours ago" },
      { name: "Jamie Sun", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80", img: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80", time: "5 hours ago" },
      { name: "Sarah Chen", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&h=150&q=80", img: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=800&q=80", time: "Yesterday" },
      { name: "Marcus", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80", img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80", time: "3 days ago" },
      { name: "Emma Johnson", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80", img: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=80", time: "1 week ago" }
    ],
    activeStoryIndex: 0,
    storyProgressInterval: null,
    storyProgressPercent: 0,
    isLudoRolling: false
  };

  // --- STICKY HEADER progressive BLUR ---
  const header = document.getElementById('main-header');
  let tickingScroll = false;
  window.addEventListener('scroll', () => {
    if (!tickingScroll) {
      window.requestAnimationFrame(() => {
        if (window.scrollY > 20) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
        tickingScroll = false;
      });
      tickingScroll = true;
    }
  });

  // --- THEME TOGGLE CONTROLLER ---
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  themeToggleBtn.addEventListener('click', () => {
    if (document.body.classList.contains('dark-theme')) {
      document.body.classList.replace('dark-theme', 'light-theme');
      state.theme = 'light';
      showToast('Switched to Light Theme ☀️');
    } else {
      document.body.classList.replace('light-theme', 'dark-theme');
      state.theme = 'dark';
      showToast('Switched to Dark Theme 🌌');
    }
  });

  // --- TOAST HELPER ---
  const toast = document.getElementById('toast-notif');
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('active');
    setTimeout(() => {
      toast.classList.remove('active');
    }, 2500);
  }

  // --- VIEW SWITCHING MANAGER (SPACIOUS CONGESTION FIX) ---
  const viewPanels = document.querySelectorAll('.view-panel');
  const sidebarNavItems = document.querySelectorAll('.nav-item');
  const radialNavItems = document.querySelectorAll('.radial-item-bubble');
  const mobileNavItems = document.querySelectorAll('.mobile-nav-btn');
  const appContainer = document.querySelector('.chats-layout-grid');

  function switchView(viewName, userId) {
    if (!viewName) return;
    
    state.activeView = viewName;

    if (viewName === 'profile') {
      const currentUserStr = localStorage.getItem('invibeUser');
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        const targetId = userId || currentUser.id || currentUser._id;
        loadUserProfile(targetId);
      }
    }
    
    // Toggle body active class to hide right sidebar and expand content width (Congestion Fix!)
    if (viewName === 'chats') {
      document.body.classList.add('chats-view-active');
      if (appContainer) appContainer.classList.remove('chatting');
      // Reset to empty state — no conversation auto-selected
      state.currentChatThread = null;
      const emptyState = document.getElementById('chat-empty-state');
      const chatHeader = document.getElementById('chat-window-header');
      const chatViewport = document.querySelector('.chat-dynamic-viewport');
      const chatFooter = document.getElementById('chat-global-footer');
      if (emptyState) emptyState.style.display = 'flex';
      if (chatHeader) chatHeader.style.display = 'none';
      if (chatViewport) chatViewport.style.display = 'none';
      if (chatFooter) chatFooter.style.display = 'none';
    } else {
      document.body.classList.remove('chats-view-active');
    }
    
    // Update active view panels
    viewPanels.forEach(panel => {
      if (panel.id === `view-${viewName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Update active sidebar nav items
    sidebarNavItems.forEach(nav => {
      const target = nav.getAttribute('data-target-view');
      if (target === viewName) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });

    // Update active radial sub-bubbles
    const activeGlow = document.getElementById('radial-active-glow');
    radialNavItems.forEach(bubble => {
      const target = bubble.getAttribute('data-target-view');
      if (target === viewName) {
        bubble.classList.add('active-bubble');
        if (activeGlow) {
          activeGlow.style.opacity = '1';
          activeGlow.style.left = (bubble.offsetLeft + (bubble.offsetWidth / 2) - 22) + 'px';
        }
      } else {
        bubble.classList.remove('active-bubble');
      }
    });

    // Update active mobile bottom nav items
    mobileNavItems.forEach(nav => {
      const target = nav.getAttribute('data-target-view');
      if (target === viewName) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });

    // Pause explore reels videos if we leave Explore View
    if (viewName !== 'explore') {
      const reelVideos = document.querySelectorAll('.reel-video');
      reelVideos.forEach(vid => vid.pause());
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Close radial menu after selection
    closeRadialMenu();
  }

  // Bind view selectors
  sidebarNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target-view');
      if (target) switchView(target);
    });
  });

  radialNavItems.forEach(bubble => {
    bubble.addEventListener('click', () => {
      const target = bubble.getAttribute('data-target-view');
      if (target) {
        switchView(target);
      }
    });
  });

  mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target-view');
      if (target) switchView(target);
    });
  });

  // Logo button returns Home
  document.getElementById('logo-button').addEventListener('click', () => {
    switchView('home');
  });

  // Profile avatar returns Profile
  document.getElementById('header-profile-avatar').addEventListener('click', () => {
    switchView('profile');
  });

  // Messages badge shortcut
  document.getElementById('messages-shortcut-btn').addEventListener('click', () => {
    switchView('chats');
  });


  // --- FLOATING RADIAL NAVIGATION MENU & TOUCH DRAG SYSTEM (SIGNATURE INTERACTION) ---
  const navContainer = document.getElementById('floating-bubble-nav');
  const mainBubble = document.getElementById('main-navigation-bubble');
  const blurOverlay = document.getElementById('radial-menu-blur-overlay');

  let isDragging = false;
  let dragStartX, dragStartY;
  let bubbleStartX, bubbleStartY;
  let wasOpenOnDragStart = false;
  let lastTouchTime = 0;

  // Prevent default image drag (fixes awkward stretching/ghosting)
  mainBubble.addEventListener('dragstart', (e) => e.preventDefault());

  // Mouse and Touch Drag Listeners
  mainBubble.addEventListener('mousedown', dragStart);
  mainBubble.addEventListener('touchstart', dragStart, { passive: true });

  function dragStart(e) {
    if (e.type === 'touchstart') {
      lastTouchTime = Date.now();
    } else if (e.type === 'mousedown') {
      // Prevent simulated mouse events on mobile touch devices
      if (Date.now() - lastTouchTime < 600) {
        return;
      }
      e.preventDefault(); // Prevent accidental text/image selection
    }

    // Track whether the menu was open when the interaction started
    wasOpenOnDragStart = navContainer.classList.contains('open');
    
    isDragging = false;
    const coords = getDragCoords(e);
    dragStartX = coords.x;
    dragStartY = coords.y;
    
    const rect = navContainer.getBoundingClientRect();
    bubbleStartX = rect.left;
    bubbleStartY = rect.top;
    
    // Disable styling transitions during active drag coordinate movement
    navContainer.style.transition = 'none';
    navContainer.classList.add('dragging');
    
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);
  }

  let dragMoveTicking = false;
  function dragMove(e) {
    const coords = getDragCoords(e);
    const deltaX = coords.x - dragStartX;
    const deltaY = coords.y - dragStartY;
    
    // 5px threshold to separate simple clicks from drags
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      isDragging = true;
      if (e.type === 'touchmove') e.preventDefault(); // Prevent double scroll in mobile
    }
    
    if (isDragging && !dragMoveTicking) {
      dragMoveTicking = true;
      window.requestAnimationFrame(() => {
        // Only set the initial position once to avoid layout thrashing
        if (!navContainer.style.left || navContainer.style.left === 'auto') {
          navContainer.style.bottom = 'auto';
          navContainer.style.right = 'auto';
          navContainer.style.margin = '0';
          navContainer.style.position = 'fixed';
          navContainer.style.left = `${bubbleStartX}px`;
          navContainer.style.top = `${bubbleStartY}px`;
        }
        
        // Use hardware-accelerated transform for 60FPS smooth dragging
        navContainer.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
        dragMoveTicking = false;
      });
    }
  }

  function dragEnd() {
    document.removeEventListener('mousemove', dragMove);
    document.removeEventListener('mouseup', dragEnd);
    document.removeEventListener('touchmove', dragMove);
    document.removeEventListener('touchend', dragEnd);
    
    navContainer.classList.remove('dragging');
    navContainer.style.transition = '';
    
    if (isDragging) {
      // Commit the translation to left/top to preserve position correctly
      const rect = navContainer.getBoundingClientRect();
      navContainer.style.transform = 'none';
      navContainer.style.left = `${rect.left}px`;
      navContainer.style.top = `${rect.top}px`;
    }
    
    if (!isDragging) {
      // True toggle: if menu was open when click started, close it; otherwise open it
      if (wasOpenOnDragStart) {
        closeRadialMenu();
      } else {
        openRadialMenu();
      }
    } else {
      // If dragging while menu was open, close it to prevent glitching
      if (wasOpenOnDragStart) {
        closeRadialMenu();
      }
      // Clamp boundaries inside screen coordinates with 20px padding
      clampBubblePosition();
      showToast('Navigation bubble repositioned! ⚓');
    }
  }

  function getDragCoords(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function clampBubblePosition() {
    const rect = navContainer.getBoundingClientRect();
    const pad = 20;
    let targetX = rect.left;
    let targetY = rect.top;
    
    if (targetX < pad) targetX = pad;
    if (targetX > window.innerWidth - rect.width - pad) targetX = window.innerWidth - rect.width - pad;
    if (targetY < pad) targetY = pad;
    if (targetY > window.innerHeight - rect.height - pad) targetY = window.innerHeight - rect.height - pad;
    
    navContainer.style.left = `${targetX}px`;
    navContainer.style.top = `${targetY}px`;
    navContainer.style.transform = 'none'; // Lock translate off!
  }

  // Handle window resizing bounds safety
  window.addEventListener('resize', () => {
    if (navContainer.style.position === 'fixed') {
      clampBubblePosition();
    }
  });

  function toggleRadialMenu() {
    const isOpen = navContainer.classList.contains('open');
    if (isOpen) {
      closeRadialMenu();
    } else {
      openRadialMenu();
    }
  }

  function openRadialMenu() {
    // Dynamic quadrant orientation calculation
    const rect = navContainer.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const centerX = rect.left + rect.width / 2;
    
    // Vertical flip: if in top half of the screen, pop sub-bubbles downwards
    if (centerY < window.innerHeight / 2) {
      navContainer.style.setProperty('--radial-y-dir', '1');
      navContainer.classList.add('expand-downwards');
    } else {
      navContainer.style.setProperty('--radial-y-dir', '-1');
      navContainer.classList.remove('expand-downwards');
    }
    
    // Horizontal mirror: if too close to left or right edges
    if (centerX < 180) {
      navContainer.style.setProperty('--radial-x-dir', '1.2'); // push rightwards
    } else if (window.innerWidth - centerX < 180) {
      navContainer.style.setProperty('--radial-x-dir', '-1.2'); // push leftwards
    } else {
      navContainer.style.setProperty('--radial-x-dir', '1');
    }

    navContainer.classList.add('open');
    blurOverlay.classList.add('active'); // Localized circular blur active
    
    // Rotate HiHubble logo icon
    const logoIcon = mainBubble.querySelector('.orb-logo-icon');
    if (logoIcon) {
      logoIcon.style.transform = 'rotate(225deg) scale(1.1)';
    }
  }

  function closeRadialMenu() {
    navContainer.classList.remove('open');
    blurOverlay.classList.remove('active');
    
    const logoIcon = mainBubble.querySelector('.orb-logo-icon');
    if (logoIcon) {
      logoIcon.style.transform = 'rotate(0deg) scale(1)';
    }
  }

  // Close radial menu when clicking backdrop overlay
  blurOverlay.addEventListener('click', closeRadialMenu);

  // Close radial menu on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRadialMenu();
    }
  });

  // Search bubble opens dedicated search view
  document.getElementById('radial-search-btn').addEventListener('click', () => {
    closeRadialMenu();
    switchView('search');
    const searchInput = document.getElementById('search-view-input');
    if (searchInput) {
      setTimeout(() => {
        searchInput.focus();
      }, 80);
    }
    showToast('Search page opened 🔍');
  });

  // Logout bubble triggers security logout
  const radialLogoutBtn = document.getElementById('radial-logout-btn');
  if (radialLogoutBtn) {
    radialLogoutBtn.addEventListener('click', () => {
      closeRadialMenu();
      const mainLogoutBtn = document.getElementById('logout-btn');
      if (mainLogoutBtn) {
        mainLogoutBtn.click();
      }
    });
  }


  // --- STORIES SECTION SCROLL DRAG MOMENTUM ---
  const storiesScroll = document.getElementById('stories-scroll');
  let isDown = false;
  let startX;
  let scrollLeft;

  if (storiesScroll) {
    storiesScroll.addEventListener('mousedown', (e) => {
      isDown = true;
      startX = e.pageX - storiesScroll.offsetLeft;
      scrollLeft = storiesScroll.scrollLeft;
    });
    
    storiesScroll.addEventListener('mouseleave', () => {
      isDown = false;
    });
    
    storiesScroll.addEventListener('mouseup', () => {
      isDown = false;
    });
    
    let storiesTicking = false;
    storiesScroll.addEventListener('mousemove', (e) => {
      if(!isDown) return;
      e.preventDefault();
      if (!storiesTicking) {
        storiesTicking = true;
        const x = e.pageX - storiesScroll.offsetLeft;
        const walk = (x - startX) * 2.5; 
        window.requestAnimationFrame(() => {
          storiesScroll.scrollLeft = scrollLeft - walk;
          storiesTicking = false;
        });
      }
    });
  }

  // --- LIKE INTERACTION & PARTICLE SYSTEMS ---
  const likeActionItems = document.querySelectorAll('.like-btn-action');
  const mediaContainers = document.querySelectorAll('.post-media-container');

  function triggerHeartExplosion(x, y, container) {
    const particleCount = 10;
    const colors = ['#6C3BFF', '#8A5CFF', '#a855f7', '#c084fc', '#e9d5ff'];
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'explosion-particle';
      particle.innerHTML = '💜';
      
      const angle = Math.random() * Math.PI * 2;
      const distance = 40 + Math.random() * 80;
      const randomX = Math.cos(angle) * distance;
      const randomY = Math.sin(angle) * distance - 20; 
      
      particle.style.setProperty('--x', `${randomX}px`);
      particle.style.setProperty('--y', `${randomY}px`);
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      
      particle.style.color = colors[Math.floor(Math.random() * colors.length)];
      particle.style.fontSize = `${10 + Math.random() * 14}px`;
      
      container.appendChild(particle);
      
      setTimeout(() => {
        particle.remove();
      }, 800);
    }
  }

  function toggleLike(postId, buttonWrapper, clickX, clickY, container) {
    const postStateKey = `post${postId}`;
    const isCurrentlyLiked = state.isLiked[postStateKey];
    
    const countSpan = buttonWrapper.querySelector('.action-count');
    const heartBtn = buttonWrapper.querySelector('.action-circle-btn');
    
    if (!isCurrentlyLiked) {
      state.isLiked[postStateKey] = true;
      state.likesCount[postStateKey]++;
      buttonWrapper.classList.add('liked');
      
      if (countSpan) {
        countSpan.textContent = formatCount(state.likesCount[postStateKey]);
      }
      
      if (clickX !== null && clickY !== null && container) {
        triggerHeartExplosion(clickX, clickY, container);
      } else if (container) {
        const rect = container.getBoundingClientRect();
        triggerHeartExplosion(rect.width / 2, rect.height / 2, container);
      }
      showToast('Liked post! 💜');
    } else {
      state.isLiked[postStateKey] = false;
      state.likesCount[postStateKey]--;
      buttonWrapper.classList.remove('liked');
      
      if (countSpan) {
        countSpan.textContent = formatCount(state.likesCount[postStateKey]);
      }
    }
  }

  function formatCount(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num;
  }

  // Disabled old hardcoded static feed post likes. Dynamic likes are loaded in loadFeedPosts()

  // --- POST 2 VIDEO PLAYBACK ---
  const videoPost = document.getElementById('post-2');
  if (videoPost) {
    const video = videoPost.querySelector('.post-media-video');
    const playOverlay = videoPost.querySelector('.video-play-overlay');
    const playIcon = playOverlay.querySelector('i');
    
    playOverlay.addEventListener('click', () => {
      if (video.paused) {
        video.play();
        playIcon.setAttribute('data-lucide', 'pause');
        playOverlay.style.background = 'rgba(0,0,0,0)';
        playOverlay.style.opacity = '0';
      } else {
        video.pause();
        playIcon.setAttribute('data-lucide', 'play');
        playOverlay.style.background = 'rgba(0,0,0,0.25)';
        playOverlay.style.opacity = '1';
      }
      debouncedCreateIcons();
    });
  }


  // --- EXPLORE & REELS TAB AND INTERACTIONS ---
  const exTabPills = document.querySelectorAll('.ex-tab-pill');
  const exploreReelsContainer = document.getElementById('explore-reels-container');
  const explorePostsContainer = document.getElementById('explore-posts-container');

  exTabPills.forEach(pill => {
    pill.addEventListener('click', () => {
      exTabPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      
      const tabName = pill.getAttribute('data-ex-tab');
      if (tabName === 'reels') {
        exploreReelsContainer.classList.add('active');
        explorePostsContainer.classList.remove('active');
        // Autoplay first reel
        const firstVideo = exploreReelsContainer.querySelector('.reel-video');
        if (firstVideo) firstVideo.play();
      } else {
        exploreReelsContainer.classList.remove('active');
        explorePostsContainer.classList.add('active');
        // Pause all reels
        const videos = exploreReelsContainer.querySelectorAll('.reel-video');
        videos.forEach(v => v.pause());
      }
    });
  });
  // Disabled old hardcoded reels video playback/gestures loop. Replaced with wireReelInteractions() on load.

  // --- GLOBAL FEED ACTIONS DELEGATION ---
  document.addEventListener('click', async (e) => {
    // Like button
    const likeBtn = e.target.closest('.like-btn-action');
    if (likeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const pid = likeBtn.getAttribute('data-post-id') || likeBtn.closest('[data-post-id]')?.getAttribute('data-post-id') || '1';
      await togglePostLike(pid, likeBtn);
    }

    // Bookmark / Save button
    const bookmarkBtn = e.target.closest('.bookmark-btn, .bookmark-btn-action');
    if (bookmarkBtn) {
      e.preventDefault();
      e.stopPropagation();
      
      // Some templates use the inner button, some use the wrapper. Find the wrapper and the icon.
      const btnEl = bookmarkBtn.classList.contains('bookmark-btn') ? bookmarkBtn : (bookmarkBtn.querySelector('.bookmark-btn') || bookmarkBtn);
      const icon = btnEl.querySelector('i, svg') || bookmarkBtn.querySelector('i, svg');
      
      const isSaved = btnEl.classList.contains('saved');
      if (isSaved) {
        btnEl.classList.remove('saved');
        if (icon) { icon.style.fill = 'none'; icon.style.stroke = ''; }
        showToast('Removed from Saved');
      } else {
        btnEl.classList.add('saved');
        if (icon) { icon.style.fill = '#FBBF24'; icon.style.stroke = '#FBBF24'; }
        showToast('Saved to collection ⭐');
      }
    }
  });


  // --- PREMIUM STORY AUTO-PLAY VIEWER SYSTEM ---
  const storyCards = document.querySelectorAll('.story-card.active-story');
  const storyViewer = document.getElementById('story-viewer-modal');
  const storyViewerClose = document.getElementById('story-viewer-close');
  const storyViewerAvatar = document.getElementById('story-viewer-avatar');
  const storyViewerName = document.getElementById('story-viewer-name');
  const storyViewerTime = document.getElementById('story-viewer-time');
  const storyViewerImg = document.getElementById('story-viewer-img');
  const storyProgressBars = document.getElementById('story-progress-bars');
  
  const storyPrev = document.getElementById('story-prev-btn');
  const storyNext = document.getElementById('story-next-btn');
  
  function openStoryViewer(index) {
    state.activeStoryIndex = index;
    storyViewer.classList.add('active');
    loadStoryContent(index);
  }

  function loadStoryContent(index) {
    const data = state.stories[index];
    if (!data) {
      closeStoryViewer();
      return;
    }
    
    storyViewerAvatar.src = data.avatar;
    storyViewerName.textContent = data.name;
    storyViewerTime.textContent = data.time;
    storyViewerImg.src = data.img;

    // Update like button state
    updateStoryLikeUI(data.isLiked || false, data.likesCount || 0);
    
    // Reset/Re-build Progress Bars
    storyProgressBars.innerHTML = '';
    for (let i = 0; i < state.stories.length; i++) {
      const barWrapper = document.createElement('div');
      barWrapper.className = 'story-progress-bar-wrapper';
      const barFill = document.createElement('div');
      barFill.className = 'story-progress-bar-fill';
      
      if (i < index) {
        barFill.style.width = '100%';
      } else if (i > index) {
        barFill.style.width = '0%';
      }
      
      barWrapper.appendChild(barFill);
      storyProgressBars.appendChild(barWrapper);
    }
    
    startStoryTimer();
  }

  function startStoryTimer() {
    stopStoryTimer();
    state.storyProgressPercent = 0;
    
    const activeFill = storyProgressBars.children[state.activeStoryIndex].querySelector('.story-progress-bar-fill');
    
    state.storyProgressInterval = setInterval(() => {
      state.storyProgressPercent += 0.4; // 0.4 * 250 ticks = 100% (5000ms total)
      if (activeFill) activeFill.style.width = `${state.storyProgressPercent}%`;
      
      if (state.storyProgressPercent >= 100) {
        stopStoryTimer();
        // Go to next story
        if (state.activeStoryIndex < state.stories.length - 1) {
          openStoryViewer(state.activeStoryIndex + 1);
        } else {
          closeStoryViewer();
        }
      }
    }, 20); // 20ms interval for smooth 50 FPS refresh rate
  }

  function stopStoryTimer() {
    if (state.storyProgressInterval) {
      clearInterval(state.storyProgressInterval);
      state.storyProgressInterval = null;
    }
  }

  function closeStoryViewer() {
    stopStoryTimer();
    storyViewer.classList.remove('active');
  }

  // Circular stories card click trigger
  storyCards.forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.getAttribute('data-story-index'));
      openStoryViewer(idx);
    });
  });

  if (storyViewerClose) storyViewerClose.addEventListener('click', closeStoryViewer);
  if (storyPrev) {
    storyPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.activeStoryIndex > 0) {
        openStoryViewer(state.activeStoryIndex - 1);
      }
    });
  }
  if (storyNext) {
    storyNext.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.activeStoryIndex < state.stories.length - 1) {
        openStoryViewer(state.activeStoryIndex + 1);
      } else {
        closeStoryViewer();
      }
    });
  }

  // Reply Story simulation
  const storyReplySend = document.getElementById('story-reply-send');
  const storyReplyInput = document.getElementById('story-reply-input');
  if (storyReplySend) {
    storyReplySend.addEventListener('click', () => {
      const txt = storyReplyInput.value.trim();
      if (txt) {
        showToast('Hubs reply sent! 📩');
        storyReplyInput.value = '';
        closeStoryViewer();
      }
    });
  }

  // --- HUB (STORY) LIKE SYSTEM ---
  const storyLikeBtn = document.getElementById('story-like-btn');
  const storyLikeCount = document.getElementById('story-like-count');

  async function likeCurrentStory() {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;
    const storyData = state.stories[state.activeStoryIndex];
    if (!storyData || !storyData._id) return;

    try {
      const res = await fetch(`${API_URL}/api/stories/${storyData._id}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to like story');
      const result = await res.json();

      // Update local state
      storyData.likesCount = result.likesCount;
      storyData.isLiked = result.isLiked;

      // Update UI
      updateStoryLikeUI(result.isLiked, result.likesCount);
      showToast(result.isLiked ? 'Liked this Hub! ❤️' : 'Unliked this Hub');
    } catch (err) {
      console.error('Error liking story:', err);
    }
  }

  function updateStoryLikeUI(isLiked, count) {
    if (storyLikeBtn) {
      storyLikeBtn.classList.toggle('liked', isLiked);
    }
    if (storyLikeCount) {
      storyLikeCount.textContent = count;
    }
  }

  if (storyLikeBtn) {
    storyLikeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      likeCurrentStory();
    });
  }

  // Load dynamic stories from backend
  async function loadStories() {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/stories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch stories');
      const dbStories = await res.json();

      const storyScroll = document.getElementById('stories-scroll');
      if (!storyScroll) return;

      const yourVibeBtn = document.getElementById('story-btn-current');
      storyScroll.innerHTML = '';
      if (yourVibeBtn) {
        storyScroll.appendChild(yourVibeBtn);
      }

      const currentUser = getCurrentUser();
      const currentUserId = currentUser ? (currentUser.id || currentUser._id) : null;
      const mappedStories = [];
      dbStories.forEach(story => {
        const likes = story.likes || [];
        mappedStories.push({
          _id: story._id,
          authorId: story.author._id,
          name: story.author.fullName,
          avatar: story.author.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80',
          img: story.mediaUrl,
          time: formatTimeAgo(story.createdAt),
          likesCount: likes.length,
          isLiked: currentUserId ? likes.includes(currentUserId) : false
        });
      });
      state.stories = mappedStories;

      state.stories.forEach((story, idx) => {
        const card = document.createElement('div');
        card.className = 'story-card active-story';
        card.setAttribute('data-story-index', idx);
        card.innerHTML = `
          <div class="story-avatar-container">
            <div class="story-ring"></div>
            <img src="${story.avatar}" alt="${story.name}" />
          </div>
          <span class="story-username">${story.name.split(' ')[0]}</span>
        `;

        card.addEventListener('click', () => {
          openStoryViewer(idx);
          card.classList.add('story-seen');
        });

        storyScroll.appendChild(card);
      });

      debouncedCreateIcons();
    } catch (err) {
      console.error('Error loading stories:', err);
    }
  }

  function formatTimeAgo(dateStr) {
    const created = new Date(dateStr);
    const diffMs = Date.now() - created.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.round(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return '1d ago';
  }

  window.loadStories = loadStories;

  // Post story upload simulation
  const addStoryBtn = document.getElementById('add-story-file-trigger');
  const storyFileInput = document.getElementById('story-file-input');

  if (addStoryBtn) {
    addStoryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      storyFileInput.click();
    });
  }

  if (storyFileInput) {
    storyFileInput.addEventListener('change', () => {
      if (storyFileInput.files.length > 0) {
        const file = storyFileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          const imgUrl = e.target.result;
          const token = localStorage.getItem('invibe_jwt_token');
          if (!token) {
            showToast('Please log in to publish a story! 🔐');
            return;
          }
          fetch(`${API_URL}/api/stories`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              mediaUrl: imgUrl,
              mediaType: 'image'
            })
          })
          .then(res => res.json())
          .then(newStory => {
            loadStories();
            showToast('New story published successfully! 📸✨');
          })
          .catch(err => {
            console.error(err);
            showToast('Failed to publish story.');
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }


  // --- CREATE POST CARD CONTROLLER ---
  const createPostCaption = document.getElementById('create-post-caption');
  const createPostFileInput = document.getElementById('create-post-file-input');
  const createPostMediaBtn = document.getElementById('create-post-media-btn');
  const createPostSubmitBtn = document.getElementById('create-post-submit-btn');
  const createPostPreviewContainer = document.getElementById('create-post-preview-container');
  const createPostPreviewImg = document.getElementById('create-post-preview-img');
  const createPostPreviewVideo = document.getElementById('create-post-preview-video');
  const createPostRemoveBtn = document.getElementById('create-post-remove-btn');
  let selectedPostMediaBase64 = null;
  let selectedPostMediaType = 'image';

  if (createPostMediaBtn && createPostFileInput) {
    createPostMediaBtn.addEventListener('click', () => {
      createPostFileInput.click();
    });
  }

  function updateSubmitButtonState() {
    const hasCaption = createPostCaption.value.trim().length > 0;
    const hasMedia = !!selectedPostMediaBase64;
    createPostSubmitBtn.disabled = !(hasCaption || hasMedia);
  }

  if (createPostCaption) {
    createPostCaption.addEventListener('input', updateSubmitButtonState);
  }

  if (createPostFileInput) {
    createPostFileInput.addEventListener('change', () => {
      if (createPostFileInput.files.length > 0) {
        const file = createPostFileInput.files[0];
        const isVideo = file.type.startsWith('video/');
        selectedPostMediaType = isVideo ? 'video' : 'image';

        const reader = new FileReader();
        reader.onload = (e) => {
          selectedPostMediaBase64 = e.target.result;
          createPostPreviewContainer.style.display = 'block';
          if (isVideo) {
            createPostPreviewImg.style.display = 'none';
            createPostPreviewVideo.style.display = 'block';
            createPostPreviewVideo.src = selectedPostMediaBase64;
          } else {
            createPostPreviewVideo.style.display = 'none';
            createPostPreviewImg.style.display = 'block';
            createPostPreviewImg.src = selectedPostMediaBase64;
          }
          updateSubmitButtonState();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (createPostRemoveBtn) {
    createPostRemoveBtn.addEventListener('click', () => {
      createPostFileInput.value = '';
      selectedPostMediaBase64 = null;
      createPostPreviewContainer.style.display = 'none';
      createPostPreviewImg.src = '';
      createPostPreviewVideo.src = '';
      updateSubmitButtonState();
    });
  }

  if (createPostSubmitBtn) {
    createPostSubmitBtn.addEventListener('click', async () => {
      const captionText = createPostCaption.value.trim();
      const token = localStorage.getItem('invibe_jwt_token');

      if (!token) {
        showToast('Please log in to publish a post! 🔐');
        return;
      }

      if (!selectedPostMediaBase64 && !captionText) {
        showToast('Please write a caption or add a photo/video.');
        return;
      }

      createPostSubmitBtn.disabled = true;
      createPostSubmitBtn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Publishing...';
      debouncedCreateIcons();

      try {
        const payload = {
          caption: captionText,
          mediaUrl: selectedPostMediaBase64 || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80', // use default abstract if text-only post
          mediaType: selectedPostMediaType
        };

        const res = await fetch(`${API_URL}/api/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Server error');
        }

        showToast('New hub published successfully! 📸✨');

        // Reset fields
        createPostCaption.value = '';
        createPostFileInput.value = '';
        selectedPostMediaBase64 = null;
        createPostPreviewContainer.style.display = 'none';
        createPostPreviewImg.src = '';
        createPostPreviewVideo.src = '';
        updateSubmitButtonState();

        // Refresh lists
        loadFeedPosts();
        loadProfileStats();
      } catch (err) {
        console.error(err);
        showToast('Failed to publish post: ' + err.message);
      } finally {
        createPostSubmitBtn.innerHTML = '<i data-lucide="send" style="width:14px; height:14px;"></i> Share Your Hubs';
        debouncedCreateIcons();
      }
    });
  }


  // --- INTERACTIVE LUDO LOBBY ROLLER WIDGET ---
  const diceRoller = document.getElementById('ludo-dice-roller');
  const diceFace = document.getElementById('ludo-dice-face');
  const rollDiceBtn = document.getElementById('ludo-roll-btn');
  const ludoChatFeed = document.getElementById('ludo-chat-feed');

  function rollLudoDice() {
    if (state.isLudoRolling) return;
    
    state.isLudoRolling = true;
    diceFace.classList.add('rolling');
    showToast('Rolling dice... 🎲');
    
    setTimeout(() => {
      diceFace.classList.remove('rolling');
      const rolledNumber = Math.floor(Math.random() * 6) + 1;
      
      // Update Dots Layout
      updateDiceFaceDots(rolledNumber);
      
      // Log Action
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const myLine = document.createElement('div');
      myLine.className = 'chat-log-line';
      myLine.innerHTML = `🎲 <strong>You rolled a ${rolledNumber}!</strong> <span class="log-time">${time}</span>`;
      ludoChatFeed.appendChild(myLine);
      ludoChatFeed.scrollTop = ludoChatFeed.scrollHeight;
      
      // Party spark if rolled 6!
      if (rolledNumber === 6) {
        showToast('🎲 SIX! Roll again! 🎉');
        triggerConfettiAlert();
      }
      
      // Emma simulated reply after 1.2s
      simulateEmmaRoll();
      
      state.isLudoRolling = false;
    }, 600);
  }

  function updateDiceFaceDots(num) {
    diceFace.innerHTML = '';
    const dotsConfigs = {
      1: ['dot-center'],
      2: ['dot-top-left', 'dot-bottom-right'],
      3: ['dot-top-left', 'dot-center', 'dot-bottom-right'],
      4: ['dot-top-left', 'dot-top-right', 'dot-bottom-left', 'dot-bottom-right'],
      5: ['dot-top-left', 'dot-top-right', 'dot-center', 'dot-bottom-left', 'dot-bottom-right'],
      6: ['dot-top-left', 'dot-top-right', 'dot-mid-left', 'dot-mid-right', 'dot-bottom-left', 'dot-bottom-right']
    };
    
    const classes = dotsConfigs[num] || ['dot-center'];
    classes.forEach(c => {
      const dot = document.createElement('div');
      dot.className = `dice-dot ${c}`;
      diceFace.appendChild(dot);
    });
  }

  function simulateEmmaRoll() {
    setTimeout(() => {
      const emmaNum = Math.floor(Math.random() * 6) + 1;
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const emmaLine = document.createElement('div');
      emmaLine.className = 'chat-log-line';
      emmaLine.innerHTML = `🎲 <strong>Emma rolled a ${emmaNum}!</strong> <span class="log-time">${time}</span>`;
      
      const emmaSpeak = document.createElement('div');
      emmaSpeak.className = 'chat-log-line';
      
      if (emmaNum === 6) {
        emmaSpeak.innerHTML = `💬 <strong>Emma:</strong> Yes! Ludo token out! 🥳`;
      } else if (emmaNum < 3) {
        emmaSpeak.innerHTML = `💬 <strong>Emma:</strong> Bad luck, slow turn. 😴`;
      } else {
        emmaSpeak.innerHTML = `💬 <strong>Emma:</strong> Rolling coordinates are locked! 🚀`;
      }
      
      ludoChatFeed.appendChild(emmaLine);
      ludoChatFeed.appendChild(emmaSpeak);
      ludoChatFeed.scrollTop = ludoChatFeed.scrollHeight;
    }, 1200);
  }

  function triggerConfettiAlert() {
    // Generate dozens of hearts floating inside active window
    const lobby = document.querySelector('.gaming-together-layout');
    if (!lobby) return;
    
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        const x = 50 + Math.random() * (lobby.clientWidth - 100);
        const y = lobby.clientHeight - 40;
        
        const floatEmoji = document.createElement('div');
        floatEmoji.className = 'floating-reaction-emoji';
        floatEmoji.textContent = '🎉';
        floatEmoji.style.left = `${x}px`;
        floatEmoji.style.top = `${y}px`;
        
        const rnd = -40 + Math.random() * 80;
        floatEmoji.style.setProperty('--rnd-x', `${rnd}px`);
        floatEmoji.style.setProperty('--rnd-x-end', `${rnd + (-40 + Math.random() * 80)}px`);
        
        lobby.appendChild(floatEmoji);
        setTimeout(() => floatEmoji.remove(), 1200);
      }, i * 60);
    }
  }

  if (diceRoller) diceRoller.addEventListener('click', rollLudoDice);
  if (rollDiceBtn) rollDiceBtn.addEventListener('click', rollLudoDice);


  // ─── CLIENT-SIDE END-TO-END ENCRYPTION (E2EE) SYSTEM ──────────────────────
  // Pure-JS RC4 stream cipher helper
  function rc4Cipher(str, key) {
    let s = [], j = 0, x, res = '';
    for (let i = 0; i < 256; i++) {
      s[i] = i;
    }
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
      x = s[i]; s[i] = s[j]; s[j] = x;
    }
    let i = 0;
    j = 0;
    for (let y = 0; y < str.length; y++) {
      i = (i + 1) % 256;
      j = (j + s[i]) % 256;
      x = s[i]; s[i] = s[j]; s[j] = x;
      res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
    }
    return res;
  }

  function encryptMessage(plaintext, secretKey) {
    try {
      const utf8SafeStr = unescape(encodeURIComponent(plaintext));
      const encrypted = rc4Cipher(utf8SafeStr, secretKey);
      return btoa(encrypted);
    } catch (e) {
      console.error('Encryption error:', e);
      return plaintext;
    }
  }

  function decryptMessage(base64str, secretKey) {
    try {
      const decrypted = rc4Cipher(atob(base64str), secretKey);
      return decodeURIComponent(escape(decrypted));
    } catch (e) {
      console.error('Decryption error:', e);
      return '[Decryption Failed]';
    }
  }

  function getChatSecretKey(userA_Id, userB_Id) {
    return [userA_Id.toString(), userB_Id.toString()].sort().join('_');
  }

  function getCurrentUser() {
    const userStr = localStorage.getItem('invibeUser');
    if (!userStr) return null;
    try { return JSON.parse(userStr); } catch { return null; }
  }

  // --- DYNAMIC CHAT LOGS AND FEEDS ---
  const chatHeaderName = document.querySelector('.chat-header-name');
  const chatHeaderAvatar = document.querySelector('.chat-header-avatar');
  const messagesScroll = document.getElementById('chat-messages-container');
  const chatThreadsList = document.querySelector('.chat-threads-list');

  const chatFeeds = {}; // Dynamic local memory: { targetUserId: [messages] }
  let chatThreads = []; // List of active thread items from backend

  // Load chat threads from server
  // Helper to sync unread message badges globally
  function updateGlobalUnreadBadges(count) {
    const badges = [
      document.querySelector('#messages-shortcut-btn .badge'),
      document.querySelector('.nav-item[data-target-view="chats"] .nav-badge'),
      document.querySelector('.radial-item-bubble[data-target-view="chats"] .nav-icon-badge'),
      document.querySelector('#mobile-chats-badge')
    ];

    badges.forEach(badge => {
      if (!badge) return;
      if (count > 0) {
        badge.style.display = 'flex';
        badge.textContent = count > 99 ? '99+' : count;
      } else {
        badge.style.display = 'none';
        badge.textContent = '';
      }
    });
  }

  async function loadChatThreads() {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/chats/threads`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load chat threads');
      chatThreads = await res.json();
      
      renderChatThreadsList();
    } catch (err) {
      console.error('Error loading chat threads:', err);
    }
  }

  function renderChatThreadsList() {
    if (!chatThreadsList) return;
    chatThreadsList.innerHTML = '';
    
    // Calculate total unread globally
    const totalUnread = chatThreads.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0);
    updateGlobalUnreadBadges(totalUnread);

    if (chatThreads.length === 0) {
      chatThreadsList.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">No active chats. Search users above to start.</div>';
      return;
    }

    chatThreads.forEach(thread => {
      const u = thread.user;
      if (!u) return;

      const isCurrent = state.currentChatThread === u._id;
      const lastMsg = thread.lastMessage;
      let lastTextPreview = 'Start chatting...';
      let lastTimeText = '';

      if (lastMsg) {
        const currentUser = getCurrentUser();
        if (currentUser) {
          const secretKey = getChatSecretKey(currentUser.id || currentUser._id, u._id);
          const decrypted = decryptMessage(lastMsg.content, secretKey);
          lastTextPreview = decrypted.length > 30 ? decrypted.substring(0, 27) + '...' : decrypted;
          
          const msgDate = new Date(lastMsg.createdAt);
          lastTimeText = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }

      const isOnline = (new Date() - new Date(u.lastActive)) < 120000;
      const statusClass = isOnline ? 'blue-diamond-status' : 'black-diamond-status';

      const item = document.createElement('div');
      item.className = `thread-item ${isCurrent ? 'active' : ''}`;
      item.setAttribute('data-thread', u._id);

      item.innerHTML = `
        <div class="thread-avatar">
          <img src="${u.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}" alt="${u.fullName}" />
          <span class="online-indicator ${statusClass}"></span>
        </div>
        <div class="thread-details">
          <div class="thread-meta">
            <span class="thread-name">${u.fullName}</span>
            <span class="thread-time">${lastTimeText}</span>
          </div>
          <div class="thread-preview">
            <span class="preview-text">${lastTextPreview}</span>
            ${thread.unreadCount > 0 ? `<span class="unread-count">${thread.unreadCount}</span>` : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', () => {
        state.currentChatThread = u._id;
        document.querySelectorAll('.thread-item').forEach(t => t.classList.remove('active'));
        item.classList.add('active');

        // Show chat panels, hide empty state
        const emptyState = document.getElementById('chat-empty-state');
        const chatHeader = document.getElementById('chat-window-header');
        const chatViewport = document.querySelector('.chat-dynamic-viewport');
        const chatFooter = document.getElementById('chat-global-footer');
        if (emptyState) emptyState.style.display = 'none';
        if (chatHeader) chatHeader.style.display = '';
        if (chatViewport) chatViewport.style.display = '';
        if (chatFooter) chatFooter.style.display = '';

        if (chatHeaderName) chatHeaderName.textContent = u.fullName;
        if (chatHeaderAvatar) chatHeaderAvatar.src = u.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80';

        const headerIsOnline = (new Date() - new Date(u.lastActive)) < 120000;
        const statusHtml = headerIsOnline 
          ? `<span class="online-indicator blue-diamond-status" style="position:static; display:inline-block; margin-right:4px; width:8px; height:8px;"></span> Online`
          : `<span class="online-indicator black-diamond-status" style="position:static; display:inline-block; margin-right:4px; width:8px; height:8px;"></span> Offline`;
        const headerStatus = document.querySelector('.chat-header-status');
        if (headerStatus) headerStatus.innerHTML = statusHtml;
        
        // Optimistically clear the unread count in UI
        if (thread.unreadCount > 0) {
          thread.unreadCount = 0;
          const badgeEl = item.querySelector('.unread-count');
          if (badgeEl) badgeEl.remove();
          // Recalculate total
          const totalUnread = chatThreads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
          updateGlobalUnreadBadges(totalUnread);
        }

        fetchMessages(u._id, true);
        markMessagesAsRead(u._id);

        // Mobile responsive layout trigger
        if (window.innerWidth <= 680) {
          const grid = document.querySelector('.chats-layout-grid');
          if (grid) grid.classList.add('chatting');
          const mainChat = document.querySelector('.chat-window-main');
          if (mainChat) mainChat.style.display = 'flex';
        }
      });

      chatThreadsList.appendChild(item);
    });
  }

  // Fetch messages between current user and target user
  async function fetchMessages(targetUserId, forceRender = true) {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/chats/${targetUserId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch messages');
      const messages = await res.json();
      
      const prevCount = (chatFeeds[targetUserId] || []).length;
      chatFeeds[targetUserId] = messages;

      if (forceRender || messages.length !== prevCount) {
        renderChatMessages(targetUserId);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }

  function renderChatMessages(targetUserId) {
    if (!messagesScroll) return;
    messagesScroll.innerHTML = '<div class="chat-date-separator">Today</div>';
    
    const messages = chatFeeds[targetUserId] || [];
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const currentUserId = currentUser.id || currentUser._id;
    const secretKey = getChatSecretKey(currentUserId, targetUserId);

    messages.forEach(msg => {
      const bubble = document.createElement('div');
      const decryptedText = decryptMessage(msg.content, secretKey);
      const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const isSent = msg.sender.toString() === currentUserId.toString();
      bubble.className = isSent ? 'chat-bubble sent' : 'chat-bubble received';

      let displayContent = `<div class="bubble-content">${decryptedText}</div>`;

      if (msg.mediaType) {
        if (msg.mediaType === 'image') {
          displayContent = `
            <div class="bubble-content chat-shared-media-card" onclick="openMediaViewer('${msg._id}')">
              <img src="${decryptedText}" style="max-width: 240px; border-radius: var(--radius-md); max-height: 200px; object-fit: cover;" />
            </div>
          `;
        } else if (msg.mediaType === 'video') {
          displayContent = `
            <div class="bubble-content chat-shared-media-card" onclick="openMediaViewer('${msg._id}')" style="position:relative;">
              <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(0,0,0,0.6); border-radius:50%; width:40px; height:40px; display:flex; justify-content:center; align-items:center; color:#fff; pointer-events:none;"><i data-lucide="play" style="width:20px; height:20px;"></i></div>
              <video src="${decryptedText}" style="max-width: 240px; border-radius: var(--radius-md); max-height: 200px; object-fit: cover;" muted></video>
            </div>
          `;
        } else if (msg.mediaType === 'file') {
          displayContent = `
            <div class="chat-shared-file-container" onclick="openMediaViewer('${msg._id}')">
              <i data-lucide="file-text" style="width:24px; height:24px; color:var(--primary); min-width:24px;"></i>
              <div class="chat-shared-file-info">
                <span class="chat-shared-file-title">${msg.mediaName || 'Document'}</span>
                <span class="chat-shared-file-size">${msg.mediaSize || ''}</span>
              </div>
            </div>
          `;
        } else if (msg.mediaType === 'voice') {
          displayContent = `
            <div class="bubble-content chat-shared-media-card" onclick="openMediaViewer('${msg._id}')">
              <div style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(255,255,255,0.05); border-radius:var(--radius-md);">
                <i data-lucide="mic" style="width:20px; height:20px; color:var(--pink);"></i>
                <div class="voice-waveform" style="display:flex; gap:2px; height:15px; align-items:center;">
                  <span style="width:2px; height:6px; background:#fff;"></span>
                  <span style="width:2px; height:12px; background:#fff;"></span>
                  <span style="width:2px; height:8px; background:#fff;"></span>
                  <span style="width:2px; height:14px; background:#fff;"></span>
                  <span style="width:2px; height:5px; background:#fff;"></span>
                </div>
                <span style="font-size:11px; color:var(--text-muted);">${msg.mediaSize || 'Voice Note'}</span>
              </div>
            </div>
          `;
        } else if (msg.mediaType === 'hub') {
          displayContent = `
            <div class="bubble-content chat-shared-media-card" onclick="openMediaViewer('${msg._id}')">
              <div style="padding:10px 14px; border:1px solid rgba(255,255,255,0.1); border-radius:var(--radius-md); background:rgba(108,59,255,0.1); display:flex; align-items:center; gap:8px;">
                <i data-lucide="sparkles" style="width:16px; height:16px; color:var(--primary);"></i>
                <div style="text-align:left;">
                  <span style="font-size:12px; font-weight:600; display:block;">${msg.mediaName || 'Shared Post'}</span>
                  <span style="font-size:10px; color:var(--text-muted);">Shared from Hub</span>
                </div>
              </div>
            </div>
          `;
        }
      }

      if (isSent) {
        const diamondHtml = msg.read 
          ? '<span class="msg-status-diamond-seen" title="Seen">💎</span>'
          : '<span class="msg-status-diamond-sent" title="Sent">◆</span>';

        bubble.innerHTML = `
          ${displayContent}
          <div class="bubble-time">${time} ${diamondHtml}</div>
        `;
      } else {
        bubble.innerHTML = `
          ${displayContent}
          <div class="bubble-time">${time}</div>
        `;
      }
      messagesScroll.appendChild(bubble);
    });
    
    messagesScroll.scrollTop = messagesScroll.scrollHeight;
    debouncedCreateIcons();
  }

  async function markMessagesAsRead(targetUserId) {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/chats/${targetUserId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadChatThreads();
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  }

  const backToInboxBtn = document.querySelector('.back-to-inbox-btn');
  if (backToInboxBtn) {
    backToInboxBtn.addEventListener('click', () => {
      const grid = document.querySelector('.chats-layout-grid');
      if (grid) grid.classList.remove('chatting');
      const mainChat = document.querySelector('.chat-window-main');
      if (mainChat) mainChat.style.display = 'none';
    });
  }

  // Chat message input and send
  const messageInput = document.getElementById('chat-message-input');
  const sendMsgBtn = document.getElementById('chat-send-msg-btn');

  async function sendMessage() {
    const text = messageInput.value.trim();
    const targetUserId = state.currentChatThread;
    if (!text || !targetUserId) return;

    const currentUser = getCurrentUser();
    const token = localStorage.getItem('invibe_jwt_token');
    if (!currentUser || !token) return;

    const secretKey = getChatSecretKey(currentUser.id || currentUser._id, targetUserId);
    const encryptedText = encryptMessage(text, secretKey);

    // Close emoji picker popover if open
    const emojiPopover = document.getElementById('chat-emoji-popover');
    if (emojiPopover) emojiPopover.classList.remove('active');

    messageInput.value = '';

    try {
      const res = await fetch(`${API_URL}/api/chats/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipient: targetUserId,
          content: encryptedText
        })
      });
      
      if (!res.ok) throw new Error('Failed to send message');
      
      await fetchMessages(targetUserId, true);
      loadChatThreads();
    } catch (err) {
      console.error('Send error:', err);
      showToast('Failed to send message: ' + err.message);
    }
  }

  if (sendMsgBtn) {
    sendMsgBtn.addEventListener('click', sendMessage);
  }
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // AI replies chips
  const replyChips = document.querySelectorAll('.reply-chip');
  replyChips.forEach(chip => {
    chip.addEventListener('click', () => {
      messageInput.value = chip.textContent;
      sendMessage();
    });
  });

  // --- EMOJI PICKER & CAMERA INTERACTIVITY ---
  const smileBtn = document.getElementById('chat-smile-btn');
  const emojiPopover = document.getElementById('chat-emoji-popover');
  const emojiGrid = document.getElementById('emoji-picker-grid');
  const emojiSearchInput = emojiPopover?.querySelector('.emoji-picker-search');
  const emojiCategoryButtons = emojiPopover?.querySelectorAll('.emoji-category-btn');
  const chatCameraInput = document.getElementById('chat-camera-file-input');
  const chatImgPickerBtn = document.getElementById('chat-img-picker-btn');
  const cameraClickSim = document.getElementById('camera-click-sim');

  const emojiLibrary = {
    All: ['😊', '😂', '😍', '👍', '🔥', '🎉', '❤️', '👏', '😮', '😢', '🙌', '🚀', '🕶️', '☕', '✨', '💯', '🥳', '🤩', '😎', '💪', '🌟', '💖', '🙏', '😇'],
    Smileys: ['😊', '😂', '😍', '😄', '😅', '😆', '😇', '😉', '😌', '🥹', '😎', '🤩', '😏', '😮', '😢', '😭', '😤', '🤯', '😴', '😋'],
    People: ['👋', '👍', '👏', '🙌', '🙏', '🤝', '💪', '🫶', '🧑‍💻', '👨‍💻', '👩‍💻', '🧠', '🤗', '🫵', '🫰', '🤟', '🤘', '👀', '🫠', '🤙'],
    Animals: ['🐶', '🐱', '🐭', '🐹', '🦊', '🐻', '🐼', '🐸', '🐵', '🐔', '🦄', '🦋', '🐙', '🐬', '🦁', '🐢', '🐳', '🦒', '🐟', '🐨'],
    Food: ['🍕', '🍔', '🍟', '🍣', '🍜', '🍩', '🍪', '🍓', '🍇', '🥑', '🥗', '🍉', '🍍', '🍰', '🍹', '☕', '🍵', '🥐', '🍌', '🍗'],
    Activities: ['⚽', '🏀', '🏈', '⚡', '🎾', '🎮', '🎨', '🎵', '🎸', '🎧', '🎬', '🎉', '🎊', '🎁', '🎯', '🏆', '🔥', '🚀', '💃', '🧘'],
    Travel: ['✈️', '🚗', '🚆', '🚲', '🏖️', '🏕️', '🌍', '⛵', '🚢', '🚁', '🗺️', '🏔️', '🌊', '🌞', '🧭', '🛫', '🛴', '🚉', '🛏️', '🏙️'],
    Objects: ['💡', '📱', '💻', '⌨️', '🖱️', '🎧', '📷', '📚', '🧰', '💼', '🪄', '🎀', '🪴', '🧴', '🪞', '🧺', '💎', '🔑', '🧩', '🛍️']
  };

  function renderEmojiGrid(category = 'All', search = '') {
    if (!emojiGrid) return;

    const normalized = search.trim().toLowerCase();
    const allEmojis = emojiLibrary[category] || emojiLibrary.All;
    const filtered = allEmojis.filter(emoji => {
      if (!normalized) return true;
      return emoji.toLowerCase().includes(normalized) || emoji.includes(search.trim());
    });

    emojiGrid.innerHTML = '';
    filtered.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-select-btn';
      btn.textContent = emoji;
      btn.setAttribute('title', emoji);
      emojiGrid.appendChild(btn);
    });
  }

  if (smileBtn && emojiPopover) {
    smileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPopover.classList.toggle('active');
      if (emojiPopover.classList.contains('active')) {
        renderEmojiGrid();
      }
    });
  }

  if (emojiCategoryButtons) {
    emojiCategoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.getAttribute('data-emoji-category');
        emojiCategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEmojiGrid(category, emojiSearchInput?.value || '');
      });
    });
  }

  if (emojiSearchInput) {
    emojiSearchInput.addEventListener('input', () => {
      const activeCategory = emojiPopover.querySelector('.emoji-category-btn.active')?.getAttribute('data-emoji-category') || 'All';
      renderEmojiGrid(activeCategory, emojiSearchInput.value);
    });
  }

  // Handle emoji selection
  if (emojiPopover && messageInput) {
    emojiPopover.addEventListener('click', (e) => {
      const selectBtn = e.target.closest('.emoji-select-btn');
      if (selectBtn) {
        e.stopPropagation();
        const emoji = selectBtn.textContent.trim();
        const startPos = messageInput.selectionStart;
        const endPos = messageInput.selectionEnd;
        const textVal = messageInput.value;
        messageInput.value = textVal.substring(0, startPos) + emoji + textVal.substring(endPos);
        messageInput.focus();
        const newCursorPos = startPos + emoji.length;
        messageInput.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }

  // Document listener to close emoji popover on click outside
  document.addEventListener('click', (e) => {
    if (emojiPopover && emojiPopover.classList.contains('active')) {
      if (!emojiPopover.contains(e.target) && (!smileBtn || !smileBtn.contains(e.target))) {
        emojiPopover.classList.remove('active');
      }
    }
  });

  // --- REAL CAMERA CAPTURE MODAL LOGIC ---
  const cameraCaptureModal = document.getElementById('camera-capture-modal');
  const cameraModalCloseBtn = document.getElementById('camera-modal-close-btn');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const cameraFallbackView = document.getElementById('camera-fallback-view');
  const fallbackUploadAction = document.getElementById('fallback-upload-action');
  const cameraCaptureAction = document.getElementById('camera-capture-action');
  let cameraStream = null;

  // Open real camera capture view
  function openCameraCapture() {
    if (!cameraCaptureModal) return;
    
    // Show modal
    cameraCaptureModal.classList.add('active');
    
    // Reset views
    if (cameraVideo) cameraVideo.style.display = 'none';
    if (cameraFallbackView) cameraFallbackView.style.display = 'flex';
    if (cameraCaptureAction) cameraCaptureAction.classList.add('disabled');
    
    // Request webcam access
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', frameRate: { ideal: 60, min: 30 } } })
        .then(stream => {
          cameraStream = stream;
          if (cameraVideo) {
            cameraVideo.srcObject = stream;
            cameraVideo.style.display = 'block';
            cameraVideo.play();
          }
          if (cameraFallbackView) cameraFallbackView.style.display = 'none';
          if (cameraCaptureAction) cameraCaptureAction.classList.remove('disabled');
        })
        .catch(err => {
          console.warn('Webcam permission denied or error:', err);
          // Keep fallback active
          if (cameraVideo) cameraVideo.style.display = 'none';
          if (cameraFallbackView) cameraFallbackView.style.display = 'flex';
          if (cameraCaptureAction) cameraCaptureAction.classList.add('disabled');
        });
    } else {
      // Browser doesn't support mediaDevices
      if (cameraVideo) cameraVideo.style.display = 'none';
      if (cameraFallbackView) cameraFallbackView.style.display = 'flex';
      if (cameraCaptureAction) cameraCaptureAction.classList.add('disabled');
    }
  }

  // Close camera capture view and stop streams
  function closeCameraCapture() {
    if (!cameraCaptureModal) return;
    
    cameraCaptureModal.classList.remove('active');
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    if (cameraVideo) {
      cameraVideo.srcObject = null;
    }
    resetCameraModalUI();
  }

  let tempCapturedImage = null;

  function resetCameraModalUI() {
    const previewImg = document.getElementById('camera-preview-img');
    if (previewImg) previewImg.style.display = 'none';
    if (cameraVideo) {
      cameraVideo.style.display = 'block';
      try { cameraVideo.play(); } catch(e){}
    }
    if (cameraCaptureAction) cameraCaptureAction.style.display = 'flex';
    const previewControls = document.getElementById('camera-preview-controls');
    if (previewControls) previewControls.style.display = 'none';
    tempCapturedImage = null;
  }

  // Bind DM camera triggers to open the capture modal
  if (chatImgPickerBtn) {
    chatImgPickerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openCameraCapture();
    });
  }

  if (cameraClickSim) {
    cameraClickSim.addEventListener('click', (e) => {
      e.preventDefault();
      openCameraCapture();
    });
  }

  if (cameraModalCloseBtn) {
    cameraModalCloseBtn.addEventListener('click', closeCameraCapture);
  }

  // Close modal on click outside modal container
  if (cameraCaptureModal) {
    cameraCaptureModal.addEventListener('click', (e) => {
      if (e.target === cameraCaptureModal) {
        closeCameraCapture();
      }
    });
  }

  // Capture frame logic
  if (cameraCaptureAction) {
    cameraCaptureAction.addEventListener('click', async () => {
      if (!cameraStream || !cameraVideo || !cameraCanvas) return;
      
      const width = cameraVideo.videoWidth || 640;
      const height = cameraVideo.videoHeight || 480;
      
      cameraCanvas.width = width;
      cameraCanvas.height = height;
      
      const ctx = cameraCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(cameraVideo, 0, 0, width, height);
        
        try {
          tempCapturedImage = cameraCanvas.toDataURL('image/png');
          
          // Freeze video and show preview img
          cameraVideo.style.display = 'none';
          const previewImg = document.getElementById('camera-preview-img');
          if (previewImg) {
            previewImg.src = tempCapturedImage;
            previewImg.style.display = 'block';
          }
          
          // Toggle buttons
          cameraCaptureAction.style.display = 'none';
          const previewControls = document.getElementById('camera-preview-controls');
          if (previewControls) previewControls.style.display = 'flex';
          
        } catch (err) {
          console.error('Error capturing image from canvas:', err);
          showToast('Failed to capture photo from webcam feed.');
        }
      }
    });
  }

  // Fallback upload action triggers hidden file selector
  if (fallbackUploadAction && chatCameraInput) {
    fallbackUploadAction.addEventListener('click', () => {
      chatCameraInput.click();
    });
  }

  // Modify file selector change event to also close camera modal if open
  if (chatCameraInput) {
    chatCameraInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function(evt) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const imgUrl = evt.target.result;
        
        const targetUserId = state.currentChatThread;
        const currentUser = getCurrentUser();
        const token = localStorage.getItem('invibe_jwt_token');

        if (targetUserId && currentUser && token) {
          try {
            const secretKey = getChatSecretKey(currentUser.id || currentUser._id, targetUserId);
            const htmlContent = `<img src="${imgUrl}" alt="Uploaded Photo" style="max-width:100%; border-radius:var(--radius-md);" />`;
            const encryptedText = encryptMessage(htmlContent, secretKey);

            await fetch(`${API_URL}/api/chats/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                recipient: targetUserId,
                content: encryptedText
              })
            });
            await fetchMessages(targetUserId, true);
            loadChatThreads();
          } catch (err) {
            console.error('File send error:', err);
            showToast('Failed to send file.');
          }
        }
        
        closeCameraCapture();
      };
      reader.readAsDataURL(file);
      // Clear value so the same file can be chosen again
      chatCameraInput.value = '';
    });
  }



  // --- INBOX SIDEBAR CONTROLS (INTERACTIVITY) ---
  const inboxSearchInput = document.getElementById('inbox-search-input');
  if (inboxSearchInput) {
    inboxSearchInput.addEventListener('input', async () => {
      const query = inboxSearchInput.value.trim();
      if (!query) {
        loadChatThreads();
        return;
      }

      const token = localStorage.getItem('invibe_jwt_token');
      if (!token) return;

      try {
        const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Search failed');
        const users = await res.json();

        chatThreads = users.map(u => ({
          user: u,
          lastMessage: null,
          unreadCount: 0
        }));

        renderChatThreadsList();
      } catch (err) {
        console.error('Inbox search error:', err);
      }
    });
  }

  const catPills = document.querySelectorAll('.cat-pill');
  catPills.forEach(pill => {
    pill.addEventListener('click', () => {
      catPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const category = pill.getAttribute('data-cat');
      
      const items = document.querySelectorAll('.thread-item');
      items.forEach(item => {
        item.style.display = 'flex';
      });
      showToast(`Filtered inbox: ${category.toUpperCase()}`);
    });
  });


  // --- SWITCH CHAT SUB-VIEW MODES ---
  const modeTabs = document.querySelectorAll('.mode-tab');
  const chatSubPanels = document.querySelectorAll('.chat-sub-panel');
  const chatGlobalFooter = document.getElementById('chat-global-footer');

  function switchChatMode(modeName) {
    state.chatMode = modeName;
    
    modeTabs.forEach(tab => {
      const mode = tab.getAttribute('data-chat-mode');
      if (mode === modeName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    chatSubPanels.forEach(panel => {
      const targetId = (modeName === 'voice-call') ? 'chat-sub-view-call' : `chat-sub-view-${modeName}`;
      if (panel.id === targetId) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    if (modeName === 'call' || modeName === 'voice-call') {
      if (chatGlobalFooter) chatGlobalFooter.style.display = 'none';
      if (!isCallActive && state.currentChatThread) {
        initiateVideoCall(state.currentChatThread, modeName === 'voice-call');
      }
    } else {
      if (chatGlobalFooter) chatGlobalFooter.style.display = 'flex';
      if (isCallActive) {
        cancelOutgoingCall();
      } else {
        stopVideoCallTimer();
      }
      const watchVideo = document.getElementById('watch-together-video');
      if (watchVideo && modeName !== 'watch') {
        watchVideo.pause();
      }
    }
    if (modeName === 'media') {
      loadSharedMediaHub();
    }
    showToast(`Switched Chat layout: ${modeName.toUpperCase()} ⚡`);
  }

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.getAttribute('data-chat-mode');
      if (mode) switchChatMode(mode);
    });
  });


  // --- CAMERA CAPTURE CONFIRMATION LISTENERS ---
  const cameraRetakeBtn = document.getElementById('camera-retake-btn');
  const cameraSendBtn = document.getElementById('camera-send-btn');

  if (cameraRetakeBtn) {
    cameraRetakeBtn.addEventListener('click', () => {
      const previewImg = document.getElementById('camera-preview-img');
      if (previewImg) previewImg.style.display = 'none';
      if (cameraVideo) {
        cameraVideo.style.display = 'block';
        cameraVideo.play();
      }
      if (cameraCaptureAction) cameraCaptureAction.style.display = 'flex';
      const previewControls = document.getElementById('camera-preview-controls');
      if (previewControls) previewControls.style.display = 'none';
      tempCapturedImage = null;
    });
  }

  if (cameraSendBtn) {
    cameraSendBtn.addEventListener('click', async () => {
      if (!tempCapturedImage) return;

      const targetUserId = state.currentChatThread;
      const currentUser = getCurrentUser();
      const token = localStorage.getItem('invibe_jwt_token');

      if (targetUserId && currentUser && token) {
        const secretKey = getChatSecretKey(currentUser.id || currentUser._id, targetUserId);
        const encryptedText = encryptMessage(tempCapturedImage, secretKey);

        try {
          await fetch(`${API_URL}/api/chats/message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              recipient: targetUserId,
              content: encryptedText,
              mediaUrl: 'camera_capture',
              mediaType: 'image',
              mediaName: `Camera_${Date.now()}.png`,
              mediaSize: '0.1 MB'
            })
          });
          await fetchMessages(targetUserId, true);
          loadChatThreads();
          showToast('Photo shared! 📸');
        } catch (err) {
          console.error('Camera send error:', err);
          showToast('Failed to send captured photo.');
        }
      }

      closeCameraCapture();
    });
  }

  // --- GALLERY FILE PICKER SYSTEM ---
  const galleryPickerBtn = document.getElementById('chat-gallery-picker-btn');
  const galleryFileInput = document.getElementById('chat-gallery-file-input');

  if (galleryPickerBtn && galleryFileInput) {
    galleryPickerBtn.addEventListener('click', () => {
      galleryFileInput.click();
    });
  }

  if (galleryFileInput) {
    galleryFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function(evt) {
        const fileDataUrl = evt.target.result;
        const targetUserId = state.currentChatThread;
        const currentUser = getCurrentUser();
        const token = localStorage.getItem('invibe_jwt_token');

        if (targetUserId && currentUser && token) {
          try {
            let mediaType = 'file';
            if (file.type.startsWith('image/')) {
              mediaType = 'image';
            } else if (file.type.startsWith('video/')) {
              mediaType = 'video';
            } else if (file.type.startsWith('audio/')) {
              mediaType = 'voice';
            }

            const sizeStr = (file.size / 1024 / 1024).toFixed(1) + ' MB';

            const secretKey = getChatSecretKey(currentUser.id || currentUser._id, targetUserId);
            const encryptedText = encryptMessage(fileDataUrl, secretKey);

            await fetch(`${API_URL}/api/chats/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                recipient: targetUserId,
                content: encryptedText,
                mediaUrl: 'gallery_upload',
                mediaType: mediaType,
                mediaName: file.name,
                mediaSize: sizeStr
              })
            });
            await fetchMessages(targetUserId, true);
            loadChatThreads();
            showToast('Media uploaded from gallery! 🖼️');
          } catch (err) {
            console.error('Gallery upload error:', err);
            showToast('Failed to upload file.');
          }
        }
      };
      reader.readAsDataURL(file);
      galleryFileInput.value = '';
    });
  }

  // --- SHARED MEDIA VIEWER AND REPLIES ---
  const mediaViewerModal = document.getElementById('media-viewer-modal');
  const mediaViewerCloseBtn = document.getElementById('media-viewer-close-btn');
  const mediaViewerTitle = document.getElementById('media-viewer-title');
  const mediaViewerViewport = document.querySelector('.media-viewer-viewport');
  const mediaViewerName = document.getElementById('media-viewer-name');
  const mediaViewerSize = document.getElementById('media-viewer-size');
  const mediaViewerReplyInput = document.getElementById('media-viewer-reply-input');
  const mediaViewerReplySend = document.getElementById('media-viewer-reply-send');

  let activeViewerMessageId = null;

  async function openMediaViewer(messageId) {
    activeViewerMessageId = messageId;
    const targetUserId = state.currentChatThread;
    if (!targetUserId || !mediaViewerModal) return;

    const conversationMsgs = chatFeeds[targetUserId] || [];
    const msg = conversationMsgs.find(m => m._id.toString() === messageId.toString());
    if (!msg || !msg.mediaType) return;

    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const currentUserId = currentUser.id || currentUser._id;
    const secretKey = getChatSecretKey(currentUserId, targetUserId);
    const decryptedData = decryptMessage(msg.content, secretKey);

    mediaViewerViewport.innerHTML = '';
    mediaViewerName.textContent = msg.mediaName || 'Shared Media';
    mediaViewerSize.textContent = msg.mediaSize || '';
    mediaViewerReplyInput.value = '';

    if (msg.mediaType === 'image') {
      mediaViewerTitle.textContent = 'View Image';
      const img = document.createElement('img');
      img.src = decryptedData;
      mediaViewerViewport.appendChild(img);
    } else if (msg.mediaType === 'video') {
      mediaViewerTitle.textContent = 'Play Video';
      const video = document.createElement('video');
      video.src = decryptedData;
      video.controls = true;
      video.autoplay = true;
      mediaViewerViewport.appendChild(video);
    } else if (msg.mediaType === 'voice') {
      mediaViewerTitle.textContent = 'Play Voice Note';
      const audio = document.createElement('audio');
      audio.src = decryptedData;
      audio.controls = true;
      audio.autoplay = true;
      mediaViewerViewport.appendChild(audio);
    } else if (msg.mediaType === 'file') {
      mediaViewerTitle.textContent = 'View Document';
      mediaViewerViewport.innerHTML = `
        <div style="text-align:center; padding:20px;">
          <i data-lucide="file-text" style="width:60px; height:60px; color:var(--primary); margin-bottom:12px;"></i>
          <p style="font-size:14px; font-weight:600; margin-bottom:16px;">${msg.mediaName}</p>
          <a href="${decryptedData}" download="${msg.mediaName}" class="glass-btn bg-pink-btn" style="padding:10px 24px; border-radius:var(--radius-md); text-decoration:none; display:inline-flex; align-items:center; gap:8px;"><i data-lucide="download"></i> Download File</a>
        </div>
      `;
      debouncedCreateIcons();
    } else if (msg.mediaType === 'hub') {
      mediaViewerTitle.textContent = 'View Shared Hub Item';
      const isReel = msg.mediaUrl.startsWith('reel');
      mediaViewerViewport.innerHTML = `
        <div style="text-align:center; padding:20px;">
          <i data-lucide="sparkles" style="width:60px; height:60px; color:var(--primary); margin-bottom:12px;"></i>
          <p style="font-size:14px; font-weight:600; margin-bottom:16px;">${msg.mediaName}</p>
          <button class="glass-btn bg-pink-btn" onclick="navigateToHubShare('${msg.mediaUrl}')" style="padding:10px 24px; border-radius:var(--radius-md); display:inline-flex; align-items:center; gap:8px;"><i data-lucide="external-link"></i> Open ${isReel ? 'Reel' : 'Post'}</button>
        </div>
      `;
      debouncedCreateIcons();
    }

    mediaViewerModal.classList.add('active');
  }
  window.openMediaViewer = openMediaViewer;

  function navigateToHubShare(id) {
    if (mediaViewerModal) mediaViewerModal.classList.remove('active');
    if (id.startsWith('reel')) {
      const reelsTab = document.querySelector('[data-view="reels"]');
      if (reelsTab) reelsTab.click();
      showToast(`Navigated to shared Reel! 🎬`);
    } else {
      const feedTab = document.querySelector('[data-view="home"]');
      if (feedTab) feedTab.click();
      showToast(`Navigated to shared Post! 📸`);
    }
  }
  window.navigateToHubShare = navigateToHubShare;

  if (mediaViewerCloseBtn) {
    mediaViewerCloseBtn.addEventListener('click', () => {
      mediaViewerModal.classList.remove('active');
      const audio = mediaViewerViewport.querySelector('audio');
      if (audio) audio.pause();
      const video = mediaViewerViewport.querySelector('video');
      if (video) video.pause();
    });
  }

  async function sendMediaViewerReply() {
    const text = mediaViewerReplyInput.value.trim();
    if (!text || !activeViewerMessageId) return;

    const targetUserId = state.currentChatThread;
    const currentUser = getCurrentUser();
    const token = localStorage.getItem('invibe_jwt_token');
    if (!targetUserId || !currentUser || !token) return;

    const conversationMsgs = chatFeeds[targetUserId] || [];
    const msg = conversationMsgs.find(m => m._id.toString() === activeViewerMessageId.toString());
    const mediaName = msg ? msg.mediaName || 'Media' : 'Media';

    const replyText = `💬 Reply to "${mediaName}": ${text}`;

    const secretKey = getChatSecretKey(currentUser.id || currentUser._id, targetUserId);
    const encryptedText = encryptMessage(replyText, secretKey);

    try {
      const res = await fetch(`${API_URL}/api/chats/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipient: targetUserId,
          content: encryptedText
        })
      });
      if (!res.ok) throw new Error();

      mediaViewerReplyInput.value = '';
      mediaViewerModal.classList.remove('active');
      showToast('Sent reply! 💬');
      
      await fetchMessages(targetUserId, true);
      loadChatThreads();
    } catch (err) {
      showToast('Failed to send reply.');
    }
  }

  if (mediaViewerReplySend) {
    mediaViewerReplySend.addEventListener('click', sendMediaViewerReply);
  }
  if (mediaViewerReplyInput) {
    mediaViewerReplyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMediaViewerReply();
      }
    });
  }

  // --- DYNAMIC SHARED MEDIA HUB IMPLEMENTATION ---
  async function loadSharedMediaHub() {
    const targetUserId = state.currentChatThread;
    const mediaGrid = document.getElementById('shared-media-items-grid');
    if (!targetUserId || !mediaGrid) return;

    const activeTab = document.querySelector('#media-hub-tabs .m-pill.active');
    const filterType = activeTab ? activeTab.getAttribute('data-media-filter') : 'all';
    
    const searchInput = document.getElementById('media-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    await fetchMessages(targetUserId, false);
    const messages = chatFeeds[targetUserId] || [];
    
    let mediaMessages = messages.filter(m => m.mediaType);

    if (filterType !== 'all') {
      mediaMessages = mediaMessages.filter(m => m.mediaType === filterType);
    }

    if (query) {
      mediaMessages = mediaMessages.filter(m => {
        const name = (m.mediaName || '').toLowerCase();
        return name.includes(query);
      });
    }

    mediaGrid.innerHTML = '';
    
    if (mediaMessages.length === 0) {
      mediaGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); font-size: 12px;">No shared media items found in this chat.</div>';
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const currentUserId = currentUser.id || currentUser._id;
    const secretKey = getChatSecretKey(currentUserId, targetUserId);

    mediaMessages.forEach(msg => {
      const card = document.createElement('div');
      card.className = 'media-item-card';
      card.setAttribute('data-type', msg.mediaType);
      card.addEventListener('click', () => {
        openMediaViewer(msg._id);
      });

      if (msg.mediaType === 'image') {
        const decryptedData = decryptMessage(msg.content, secretKey);
        card.innerHTML = `
          <img src="${decryptedData}" alt="${msg.mediaName}" style="width: 100%; height: 100%; object-fit: cover;" />
          <div class="media-item-desc">
            <span class="file-name">${msg.mediaName || 'Image'}</span>
            <span class="file-size">${msg.mediaSize || ''}</span>
          </div>
        `;
      } else if (msg.mediaType === 'video') {
        card.classList.add('video-thumb');
        card.innerHTML = `
          <div class="thumb-play-btn"><i data-lucide="play"></i></div>
          <div style="background: #000; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; color: #fff;"><i data-lucide="video" style="width: 30px; height: 30px; opacity: 0.6;"></i></div>
          <div class="media-item-desc">
            <span class="file-name">${msg.mediaName || 'Video'}</span>
            <span class="file-size">${msg.mediaSize || ''}</span>
          </div>
        `;
      } else if (msg.mediaType === 'voice') {
        card.classList.add('voice-thumb');
        card.innerHTML = `
          <div class="voice-waveform">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="media-item-desc">
            <span class="file-name">${msg.mediaName || 'Voice Note'}</span>
            <span class="file-size">${msg.mediaSize || ''}</span>
          </div>
        `;
      } else if (msg.mediaType === 'file') {
        card.classList.add('doc-thumb');
        card.innerHTML = `
          <div class="thumb-doc-icon"><i data-lucide="file-text"></i></div>
          <div class="media-item-desc">
            <span class="file-name">${msg.mediaName || 'Document'}</span>
            <span class="file-size">${msg.mediaSize || ''}</span>
          </div>
        `;
      } else if (msg.mediaType === 'hub') {
        card.classList.add('doc-thumb');
        card.style.background = 'rgba(108,59,255,0.1)';
        card.innerHTML = `
          <div class="thumb-doc-icon"><i data-lucide="sparkles" style="color: var(--primary);"></i></div>
          <div class="media-item-desc">
            <span class="file-name">${msg.mediaName || 'Shared Post'}</span>
            <span class="file-size">Hub Link</span>
          </div>
        `;
      }

      mediaGrid.appendChild(card);
    });

    debouncedCreateIcons();
  }
  window.loadSharedMediaHub = loadSharedMediaHub;

  const mediaHubPills = document.querySelectorAll('#media-hub-tabs .m-pill');
  mediaHubPills.forEach(pill => {
    pill.addEventListener('click', () => {
      mediaHubPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      loadSharedMediaHub();
    });
  });

  const mediaSearchInput = document.getElementById('media-search-input');
  if (mediaSearchInput) {
    mediaSearchInput.addEventListener('input', () => {
      loadSharedMediaHub();
    });
  }


  // --- CHAT ATTACHMENTS DRAWER ---
  const toggleAttachmentsBtn = document.getElementById('toggle-attachments-btn');
  const attachmentsDrawer = document.getElementById('chat-attachments-drawer');

  if (toggleAttachmentsBtn) {
    toggleAttachmentsBtn.addEventListener('click', () => {
      toggleAttachmentsBtn.classList.toggle('active');
      attachmentsDrawer.classList.toggle('active');
    });
  }

  // Drawer options click mode swapping
  const drawerBtns = document.querySelectorAll('.attachment-action-btn');
  drawerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const openMode = btn.getAttribute('data-open-mode');
      if (openMode) {
        switchChatMode(openMode);
        toggleAttachmentsBtn.classList.remove('active');
        attachmentsDrawer.classList.remove('active');
      }
    });
  });

  const simpleDrawerAlerts = [
    { id: 'camera-click-sim', label: 'Camera stream active. Photo taken! 📸' },
    { id: 'mic-click-sim', label: 'Audio recording started... 🎙️' },
    { id: 'loc-click-sim', label: 'Location shared: 37.7749° N, 122.4194° W 📍' },
    { id: 'ai-click-sim', label: 'Hi-HUBBLE AI Assistant: Processing chats... ✨' },
    { id: 'poll-click-sim', label: 'Poll Widget created: "What time is offsite?" 📊' }
  ];

  simpleDrawerAlerts.forEach(sim => {
    const el = document.getElementById(sim.id);
    if (el) {
      el.addEventListener('click', () => {
        showToast(sim.label);
        toggleAttachmentsBtn.classList.remove('active');
        attachmentsDrawer.classList.remove('active');
      });
    }
  });


  // --- WATCH TOGETHER REACTIONS ---
  const watchReactBtns = document.querySelectorAll('.react-burst-btn');
  const watchContainer = document.querySelector('.watch-together-container');

  function triggerWatchReaction(emoji) {
    if (!watchContainer) return;
    
    const spawnX = watchContainer.clientWidth - 120 + (Math.random() * 80);
    const spawnY = watchContainer.clientHeight - 40;
    
    const floatEmoji = document.createElement('div');
    floatEmoji.className = 'floating-reaction-emoji';
    floatEmoji.textContent = emoji;
    floatEmoji.style.left = `${spawnX}px`;
    floatEmoji.style.top = `${spawnY}px`;
    
    const rnd = -50 + Math.random() * 100;
    const rndXEnd = rnd + (-60 + Math.random() * 120);
    floatEmoji.style.setProperty('--rnd-x', `${rnd}px`);
    floatEmoji.style.setProperty('--rnd-x-end', `${rndXEnd}px`);
    
    watchContainer.appendChild(floatEmoji);
    setTimeout(() => floatEmoji.remove(), 1200);
  }

  watchReactBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      triggerWatchReaction(emoji);
      
      // Live Chat update log
      if (watchMessagesScroll) {
        const line = document.createElement('div');
        line.className = 'watch-msg animate-appear';
        line.innerHTML = `<span class="w-user me">You:</span> Reacted with ${emoji}`;
        watchMessagesScroll.appendChild(line);
        watchMessagesScroll.scrollTop = watchMessagesScroll.scrollHeight;
      }

      // Increment viewer count
      const watchCount = document.getElementById('watch-count-lbl');
      if (watchCount) watchCount.textContent = '4';
    });
  });


  // --- WEBRTC AND VIDEO CALL STATE ---
  let localStream = null;
  let peerConnection = null;
  let currentCallId = null;
  let callStatePollingInterval = null;
  let isCallActive = false;
  let isCaller = false;
  let currentRecipientId = null;
  let localScreenStream = null;
  let fakeCallSimulation = false;
  let isAudioCall = false;

  let rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: 'turn:a.relay.metered.ca:80',
        username: 'e8dd65b92f6dce2b1b349112',
        credential: 'xAkqDUMHpa/GR3JR'
      },
      {
        urls: 'turn:a.relay.metered.ca:80?transport=tcp',
        username: 'e8dd65b92f6dce2b1b349112',
        credential: 'xAkqDUMHpa/GR3JR'
      },
      {
        urls: 'turn:a.relay.metered.ca:443',
        username: 'e8dd65b92f6dce2b1b349112',
        credential: 'xAkqDUMHpa/GR3JR'
      },
      {
        urls: 'turns:a.relay.metered.ca:443?transport=tcp',
        username: 'e8dd65b92f6dce2b1b349112',
        credential: 'xAkqDUMHpa/GR3JR'
      }
    ],
    iceCandidatePoolSize: 10
  };

  // Synthesized sounds
  let audioCtx = null;
  let ringToneInterval = null;

  function initAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, gainValue = 0.1) {
    try {
      initAudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      
      gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.error("Audio error:", e);
    }
  }

  function startIncomingRingtone() {
    stopAudioFeedback();
    let noteIndex = 0;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    ringToneInterval = setInterval(() => {
      playTone(notes[noteIndex % notes.length], 'triangle', 0.6, 0.12);
      noteIndex++;
    }, 350);
  }

  function startOutgoingRingback() {
    stopAudioFeedback();
    ringToneInterval = setInterval(() => {
      // US ringback: 440Hz + 480Hz
      playTone(440, 'sine', 1.5, 0.04);
      playTone(480, 'sine', 1.5, 0.04);
    }, 4000);
  }

  function playCallEndBeep() {
    stopAudioFeedback();
    playTone(250, 'sine', 0.4, 0.08);
  }

  function stopAudioFeedback() {
    if (ringToneInterval) {
      clearInterval(ringToneInterval);
      ringToneInterval = null;
    }
  }

  function getAuthHeaders() {
    const token = localStorage.getItem('invibe_jwt_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  function getUserById(userId) {
    const thread = chatThreads.find(t => t.user && t.user._id.toString() === userId.toString());
    if (thread) return thread.user;
    return null;
  }

  // --- VIDEO CALL TIMER CONTROLLER ---
  const callTimerDisplay = document.getElementById('call-timer-display');
  
  function startVideoCallTimer() {
    stopVideoCallTimer();
    state.callSeconds = 0;
    state.callTimerInterval = setInterval(() => {
      state.callSeconds++;
      if (callTimerDisplay) {
        callTimerDisplay.textContent = formatCallTime(state.callSeconds);
      }
    }, 1000);
  }

  function stopVideoCallTimer() {
    if (state.callTimerInterval) {
      clearInterval(state.callTimerInterval);
      state.callTimerInterval = null;
    }
  }

  function formatCallTime(totalSec) {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const h = hrs < 10 ? '0' + hrs : hrs;
    const m = mins < 10 ? '0' + mins : mins;
    const s = secs < 10 ? '0' + secs : secs;
    return `${h}:${m}:${s}`;
  }


  function sendIceCandidateToServer(targetId, candidate) {
    socket.emit('ice-candidate', { targetId, candidate });
  }

  function createFakeStream(isAudioOnly) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = ctx.createMediaStreamDestination();
    oscillator.start();
    oscillator.connect(dst);
    const audioTrack = dst.stream.getAudioTracks()[0];
    audioTrack.enabled = false;

    if (isAudioOnly) {
      return new MediaStream([audioTrack]);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const canvasCtx = canvas.getContext('2d');
    
    setInterval(() => {
      canvasCtx.fillStyle = '#1e1e1e';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      canvasCtx.fillStyle = '#ffffff';
      canvasCtx.font = '30px Arial';
      canvasCtx.fillText('Simulated Video Stream', 150, 240);
    }, 1000);

    const videoStream = canvas.captureStream(15);
    const videoTrack = videoStream.getVideoTracks()[0];

    return new MediaStream([audioTrack, videoTrack]);
  }

  async function initiateVideoCall(recipientId, isAudioOnly = false) {
    if (isCallActive) return;
    isCallActive = true;
    isCaller = true;
    isAudioCall = isAudioOnly;
    currentRecipientId = recipientId;

    document.getElementById('video-call-active-screen').style.display = 'none';
    document.getElementById('video-call-outgoing-screen').style.display = 'flex';
    document.getElementById('video-call-controls').style.display = 'none';

    const user = getUserById(recipientId);
    if (user) {
      document.getElementById('video-call-outgoing-name').textContent = user.fullName;
      document.getElementById('video-call-outgoing-avatar').src = user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80';
    }

    const outgoingStatus = document.getElementById('video-call-outgoing-status');
    if (outgoingStatus) outgoingStatus.textContent = isAudioOnly ? 'Audio Calling...' : 'Calling...';

    startOutgoingRingback();

    try {
      rtcConfig = await fetchTurnCredentials();
      
      const mediaConstraints = isAudioOnly 
        ? { video: false, audio: true } 
        : { video: true, audio: true };

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Not supported');
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      } catch (err) {
        console.warn('Camera/Mic error or unavailable. Using simulated stream.', err);
        localStream = createFakeStream(isAudioOnly);
      }

      const localVideo = document.getElementById('video-call-local-feed');
      const localFrame = document.getElementById('video-call-local-frame');
      if (localVideo) {
        if (isAudioOnly) {
          localVideo.srcObject = null;
          if (localFrame) localFrame.style.display = 'none';
        } else {
          localVideo.srcObject = localStream;
          localVideo.muted = true;
          if (localFrame) localFrame.style.display = 'block';
          localVideo.play().catch(e => {});
        }
      }

      peerConnection = new RTCPeerConnection(rtcConfig);

      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentRecipientId) {
          sendIceCandidateToServer(currentRecipientId, event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        if (event.streams[0]) {
          if (isAudioCall) {
            const remoteAudio = document.getElementById('remote-audio-element');
            if (remoteAudio) {
              remoteAudio.srcObject = event.streams[0];
              remoteAudio.play().catch(e => {});
            }
          } else {
            const remoteVideo = document.getElementById('video-call-remote-feed');
            if (remoteVideo) {
              remoteVideo.srcObject = event.streams[0];
              remoteVideo.play().catch(e => {});
            }
          }
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const storedUser = JSON.parse(localStorage.getItem('invibeUser'));
      socket.emit('call-initiate', {
        recipientId,
        offer,
        isAudioOnly,
        callerId: storedUser._id || storedUser.id,
        callerName: storedUser.fullName,
        callerAvatar: storedUser.profileImage
      });

    } catch (err) {
      console.error("Error initiating call:", err);
      showToast("Error initiating call 📞");
      endVideoCallLocally();
    }
  }

  function showIncomingCallModal(call) {
    if (isCallActive) return; // Ignore if already in call
    isCallActive = true;
    isCaller = false;
    currentRecipientId = call.callerId;
    isAudioCall = call.isAudioOnly;

    const modal = document.getElementById('incoming-call-modal');
    const avatar = document.getElementById('incoming-call-avatar');
    const name = document.getElementById('incoming-call-name');
    const title = document.getElementById('incoming-call-title');

    if (avatar) avatar.src = call.callerAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80';
    if (name) name.textContent = `${call.callerName} is calling you...`;
    if (title) title.textContent = isAudioCall ? 'Incoming Audio Call' : 'Incoming Video Call';

    if (modal) modal.style.display = 'flex';
    startIncomingRingtone();

    const acceptBtn = document.getElementById('accept-call-btn');
    const declineBtn = document.getElementById('decline-call-btn');

    acceptBtn.onclick = () => acceptIncomingCall(call);
    declineBtn.onclick = () => declineIncomingCall(call);
  }

  async function acceptIncomingCall(call) {
    stopAudioFeedback();
    const modal = document.getElementById('incoming-call-modal');
    if (modal) modal.style.display = 'none';

    state.currentChatThread = call.callerId;
    switchView('chats');
    switchChatMode(call.isAudioOnly ? 'voice-call' : 'call');

    document.getElementById('video-call-outgoing-screen').style.display = 'none';
    document.getElementById('video-call-active-screen').style.display = 'block';
    document.getElementById('video-call-controls').style.display = 'block';

    const remoteName = document.getElementById('video-call-remote-name');
    if (remoteName) remoteName.textContent = call.callerName;

    startVideoCallTimer();

    try {
      rtcConfig = await fetchTurnCredentials();

      const mediaConstraints = call.isAudioOnly 
        ? { video: false, audio: true } 
        : { video: true, audio: true };

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Not supported');
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      } catch (err) {
        console.warn('Camera/Mic error or unavailable. Using simulated stream.', err);
        localStream = createFakeStream(call.isAudioOnly);
      }

      const localVideo = document.getElementById('video-call-local-feed');
      const localFrame = document.getElementById('video-call-local-frame');
      if (localVideo && !call.isAudioOnly) {
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        if (localFrame) localFrame.style.display = 'block';
        localVideo.play().catch(e => {});
      }

      peerConnection = new RTCPeerConnection(rtcConfig);

      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          sendIceCandidateToServer(call.callerId, event.candidate);
        }
      };

      peerConnection.ontrack = (event) => {
        if (event.streams[0]) {
          if (call.isAudioOnly) {
            const remoteAudio = document.getElementById('remote-audio-element');
            if (remoteAudio) {
              remoteAudio.srcObject = event.streams[0];
              remoteAudio.play().catch(e => {});
            }
          } else {
            const remoteVideo = document.getElementById('video-call-remote-feed');
            if (remoteVideo) {
              remoteVideo.srcObject = event.streams[0];
              remoteVideo.play().catch(e => {});
            }
          }
        }
      };

      const offerDesc = new RTCSessionDescription(call.offer);
      await peerConnection.setRemoteDescription(offerDesc);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('call-accept', { callerId: call.callerId, answer });

      if (window.pendingCandidates && window.pendingCandidates.length > 0) {
        window.pendingCandidates.forEach(cand => {
          try { peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch(e){}
        });
        window.pendingCandidates = [];
      }

    } catch (err) {
      console.error("Error accepting incoming call:", err);
      showToast("Error accepting call 📞");
      endVideoCallLocally();
    }
  }

  function declineIncomingCall(call) {
    stopAudioFeedback();
    const modal = document.getElementById('incoming-call-modal');
    if (modal) modal.style.display = 'none';

    socket.emit('call-decline', { callerId: call.callerId });
    endVideoCallLocally();
  }

  function cancelOutgoingCall() {
    stopAudioFeedback();
    if (currentRecipientId) {
      socket.emit('call-end', { targetId: currentRecipientId });
    }
    endVideoCallLocally();
  }

  function endVideoCallLocally() {
    isCallActive = false;
    stopVideoCallTimer();
    stopAudioFeedback();
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    const localVideo = document.getElementById('video-call-local-feed');
    if (localVideo) localVideo.srcObject = null;
    const remoteVideo = document.getElementById('video-call-remote-feed');
    if (remoteVideo) remoteVideo.srcObject = null;
    const remoteAudio = document.getElementById('remote-audio-element');
    if (remoteAudio) remoteAudio.srcObject = null;

    currentRecipientId = null;
    isAudioCall = false;
    window.pendingCandidates = [];

    const muteBtn = document.getElementById('call-mute-btn');
    const camBtn = document.getElementById('call-cam-btn');
    if (muteBtn) muteBtn.classList.remove('active');
    if (camBtn) camBtn.classList.remove('active');

    const remoteContainer = document.getElementById('remote-video-container');
    const localFrame = document.getElementById('video-call-local-frame');
    const audioContainer = document.getElementById('audio-call-active-container');
    if (remoteContainer) remoteContainer.style.display = 'block';
    if (localFrame) localFrame.style.display = 'block';
    if (audioContainer) audioContainer.style.display = 'none';

    switchChatMode('chat');
  }


    // Set up listeners for controls
  const cancelOutgoingBtn = document.getElementById('cancel-outgoing-call-btn');
  if (cancelOutgoingBtn) {
    cancelOutgoingBtn.addEventListener('click', () => {
      cancelOutgoingCall();
    });
  }

  const endCallBtn = document.getElementById('end-call-btn');
  if (endCallBtn) {
    endCallBtn.addEventListener('click', () => {
      cancelOutgoingCall();
      showToast('Video Call Ended. 📞');
    });
  }

  const muteBtn = document.getElementById('call-mute-btn');
  const camBtn = document.getElementById('call-cam-btn');
  const speakerBtn = document.getElementById('call-speaker-btn');
  const shareBtn = document.getElementById('call-share-btn');
  const localCamFeed = document.getElementById('video-call-local-frame');
  const remoteCamFeed = document.getElementById('video-call-remote-feed');

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      muteBtn.classList.toggle('active');
      const isMuted = muteBtn.classList.contains('active');
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.enabled = !isMuted;
        });
      }
      showToast(isMuted ? 'Microphone Muted 🔇' : 'Microphone Active 🎙️');
    });
  }

  if (camBtn) {
    camBtn.addEventListener('click', () => {
      camBtn.classList.toggle('active');
      const isCamOff = camBtn.classList.contains('active');
      if (localStream) {
        localStream.getVideoTracks().forEach(track => {
          track.enabled = !isCamOff;
        });
      }
      localCamFeed.style.opacity = isCamOff ? '0.2' : '1';
      showToast(isCamOff ? 'Your Camera Off 📷' : 'Your Camera Active 📹');
    });
  }

  if (speakerBtn) {
    speakerBtn.addEventListener('click', () => {
      speakerBtn.classList.toggle('active');
      const isSpeakerOff = speakerBtn.classList.contains('active');
      const remoteVideo = document.getElementById('video-call-remote-feed');
      if (remoteVideo) {
        remoteVideo.muted = isSpeakerOff;
      }
      // Also mute/unmute the dedicated audio element for audio calls
      const remoteAudio = document.getElementById('remote-audio-element');
      if (remoteAudio) {
        remoteAudio.muted = isSpeakerOff;
      }
      showToast(isSpeakerOff ? 'Speaker Output: Muted 🔕' : 'Speaker Output: Loud 🔊');
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      if (fakeCallSimulation) {
        shareBtn.classList.toggle('active');
        if (shareBtn.classList.contains('active')) {
          showToast('Screen sharing initialized! 🖥️');
        } else {
          showToast('Screen sharing stopped.');
        }
        return;
      }

      if (!shareBtn.classList.contains('active')) {
        try {
          localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          shareBtn.classList.add('active');
          showToast('Screen sharing initialized! 🖥️');

          const screenTrack = localScreenStream.getVideoTracks()[0];
          
          if (peerConnection) {
            const senders = peerConnection.getSenders();
            const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
            if (videoSender) {
              videoSender.replaceTrack(screenTrack);
            }
          }

          screenTrack.onended = () => {
            stopScreenSharing();
          };

        } catch (err) {
          console.error("Screen sharing error:", err);
          showToast('Could not share screen 🖥️');
        }
      } else {
        stopScreenSharing();
      }
    });
  }

  function stopScreenSharing() {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(track => track.stop());
      localScreenStream = null;
    }
    if (shareBtn) shareBtn.classList.remove('active');
    showToast('Screen sharing stopped.');

    if (localStream && peerConnection) {
      const cameraTrack = localStream.getVideoTracks()[0];
      const senders = peerConnection.getSenders();
      const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
      if (videoSender && cameraTrack) {
        videoSender.replaceTrack(cameraTrack);
      }
    }
  }



  // --- GLOBAL SEARCH CARD FILTER CONTROLLER (Disabled. Replaced with dynamic database search) ---

  // Tags filter pills click
  const tagPills = document.querySelectorAll('.tag-pill');
  tagPills.forEach(pill => {
    pill.addEventListener('click', () => {
      tagPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      
      const filter = pill.getAttribute('data-filter-tag');
      let matchCount = 0;
      
      feedCards.forEach(card => {
        if (card.id === 'feed-empty-state') return;
        const tags = card.getAttribute('data-tags') || '';
        
        if (filter === 'all' || tags.includes(filter)) {
          card.style.display = 'flex';
          matchCount++;
        } else {
          card.style.display = 'none';
        }
      });
      
      if (matchCount === 0) {
        if (emptyStateCard) emptyStateCard.style.display = 'block';
      } else {
        if (emptyStateCard) emptyStateCard.style.display = 'none';
      }
      
      showToast(`Filter: #${filter.toUpperCase()}`);
    });
  });


  // --- COLLABORATIVE FILE DOWNLOADS & FOLDER FILTER ---
  const mediaTabs = document.getElementById('media-hub-tabs');
  const mediaHubSearch = document.getElementById('media-search-input');
  
  if (mediaTabs) {
    const tabs = mediaTabs.querySelectorAll('.m-pill');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const filter = tab.getAttribute('data-media-filter');
        const mediaCards = document.querySelectorAll('#shared-media-items-grid .media-item-card');
        
        mediaCards.forEach(card => {
          const type = card.getAttribute('data-type');
          if (filter === 'all' || type === filter) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  if (mediaHubSearch) {
    mediaHubSearch.addEventListener('input', () => {
      const term = mediaHubSearch.value.toLowerCase().trim();
      const mediaCards = document.querySelectorAll('#shared-media-items-grid .media-item-card');
      
      mediaCards.forEach(card => {
        const name = card.querySelector('.file-name').textContent.toLowerCase();
        if (name.includes(term)) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }


  // --- SIMPLE BUTTON INTERACTIONS AND ALERTS ---
  
  // Disabled hardcoded follow suggestion listeners. Managed dynamically in loadFollowSuggestions()

  // Suggest see all
  const sugSeeAll = document.getElementById('sug-see-all-btn');
  if (sugSeeAll) {
    sugSeeAll.addEventListener('click', () => {
      openSuggestedVibersModal();
    });
  }

  // Trending hash words click
  const trendItems = document.querySelectorAll('.trend-item');
  trendItems.forEach(item => {
    item.addEventListener('click', () => {
      const word = item.getAttribute('data-trend-word');
      switchView('home');
      // Set search bar value and trigger filter
      if (globalSearchInput) {
        globalSearchInput.value = `#${word}`;
        globalSearchInput.dispatchEvent(new Event('input'));
      }
      showToast(`Filtered feed: #${word} 🔥`);
    });
  });

  // --- PREMIUM EDIT PROFILE MODAL SYSTEM ---
  const editProfileModal = document.getElementById('edit-profile-modal');
  const editProfileBtn = document.getElementById('edit-profile-action-btn');
  const editProfileCloseBtn = document.getElementById('edit-profile-close-btn');
  const editProfileCancelBtn = document.getElementById('edit-profile-cancel-btn');
  const editProfileSaveBtn = document.getElementById('edit-profile-save-btn');

  // Inputs
  const editNameInput = document.getElementById('edit-profile-name-input');
  const editHandleInput = document.getElementById('edit-profile-handle-input');
  const editBioInput = document.getElementById('edit-profile-bio-input');
  const editPhoneInput = document.getElementById('edit-profile-phone-input');
  const edit2faSelect = document.getElementById('edit-profile-2fa-preference');

  // Files
  const avatarFileInput = document.getElementById('edit-profile-avatar-file');
  const bannerFileInput = document.getElementById('edit-profile-banner-file');
  const uploadAvatarTrigger = document.getElementById('upload-avatar-trigger-btn');
  const uploadBannerTrigger = document.getElementById('upload-banner-trigger-btn');

  // Previews inside Modal
  const avatarPreview = document.getElementById('edit-profile-avatar-preview');
  const bannerPreview = document.getElementById('edit-profile-banner-preview');

  // Fields to update on the main page
  const profileBannerImg = document.querySelector('.profile-banner img');
  const profileLargeAvatar = document.querySelector('.profile-screen-avatar');
  const profilePreviewAvatarImg = document.querySelector('.profile-preview-avatar img');
  const headerAvatarImg = document.querySelector('#header-profile-avatar img');
  const profileNameH2 = document.querySelector('.profile-summary-top h3');
  const profilePreviewNameH3 = document.querySelector('.profile-preview-info h3');
  const profileHandleP = document.querySelector('.profile-screen-handle');
  const profilePreviewHandleP = document.querySelector('.profile-preview-info p');
  const profileBioP = document.getElementById('profile-bio-text');

  let currentAvatarUrl = "";
  let currentBannerUrl = "";

  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      // Load current values
      if (editNameInput) {
        // Strip the HTML space if any
        const nameText = profileNameH2 ? profileNameH2.childNodes[0].textContent.trim() : "Alex Rivers";
        editNameInput.value = nameText;
      }
      if (editHandleInput) {
        editHandleInput.value = profileHandleP ? profileHandleP.textContent.trim() : "@alexrivers";
      }
      if (editBioInput) {
        editBioInput.value = profileBioP ? profileBioP.textContent.trim() : "";
      }

      // Load user preferences for phone and 2FA
      const currentUserStr = localStorage.getItem('invibeUser');
      if (currentUserStr) {
        try {
          const currentUser = JSON.parse(currentUserStr);
          if (editPhoneInput) editPhoneInput.value = currentUser.phoneNumber || "";
          if (edit2faSelect) edit2faSelect.value = currentUser.preferred2faMethod || "email";
        } catch (e) {
          console.error(e);
        }
      }

      // Previews
      if (avatarPreview && profileLargeAvatar) {
        avatarPreview.src = profileLargeAvatar.src;
        currentAvatarUrl = profileLargeAvatar.src;
      }
      if (bannerPreview && profileBannerImg) {
        bannerPreview.src = profileBannerImg.src;
        currentBannerUrl = profileBannerImg.src;
      }

      // Show modal
      if (editProfileModal) {
        editProfileModal.classList.add('active');
      }
    });
  }

  function closeEditProfileModal() {
    if (editProfileModal) {
      editProfileModal.classList.remove('active');
    }
  }

  if (editProfileCloseBtn) editProfileCloseBtn.addEventListener('click', closeEditProfileModal);
  if (editProfileCancelBtn) editProfileCancelBtn.addEventListener('click', closeEditProfileModal);

  // File upload trigger buttons
  if (uploadAvatarTrigger && avatarFileInput) {
    uploadAvatarTrigger.addEventListener('click', () => avatarFileInput.click());
  }
  if (uploadBannerTrigger && bannerFileInput) {
    uploadBannerTrigger.addEventListener('click', () => bannerFileInput.click());
  }

  // Previews on file select
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', () => {
      if (avatarFileInput.files.length > 0) {
        const file = avatarFileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          if (avatarPreview) avatarPreview.src = e.target.result;
          currentAvatarUrl = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (bannerFileInput) {
    bannerFileInput.addEventListener('change', () => {
      if (bannerFileInput.files.length > 0) {
        const file = bannerFileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          if (bannerPreview) bannerPreview.src = e.target.result;
          currentBannerUrl = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Save changes
  if (editProfileSaveBtn) {
    editProfileSaveBtn.addEventListener('click', async () => {
      const newName = editNameInput ? editNameInput.value.trim() : "";
      const newHandle = editHandleInput ? editHandleInput.value.trim() : "";
      const newBio = editBioInput ? editBioInput.value.trim() : "";
      const newPhone = editPhoneInput ? editPhoneInput.value.trim() : "";
      const new2faMethod = edit2faSelect ? edit2faSelect.value : "email";

      if (!newName || !newHandle) {
        showToast('Name and Handle are required! ⚠️');
        return;
      }

      let formattedHandle = newHandle.startsWith('@') ? newHandle.slice(1) : newHandle;
      formattedHandle = formattedHandle.trim().toLowerCase();

      const token = localStorage.getItem('invibe_jwt_token');
      let backendSuccess = false;
      let errorMsg = '';

      if (token && token !== 'mock-jwt-token') {
        try {
          const res = await fetch(`${API_URL}/api/users/profile`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              fullName: newName,
              username: formattedHandle,
              bio: newBio,
              profileImage: currentAvatarUrl || undefined,
              bannerImage: currentBannerUrl || undefined,
              phoneNumber: newPhone,
              preferred2faMethod: new2faMethod
            })
          });
          const data = await res.json();
          if (res.ok) {
            localStorage.setItem('invibeUser', JSON.stringify(data.user));
            if (data.user.profileImage) {
              localStorage.setItem('invibeProfileImage', data.user.profileImage);
            }
            if (currentBannerUrl) {
              localStorage.setItem('invibeBannerImage', currentBannerUrl);
            }
            backendSuccess = true;
          } else {
            errorMsg = data.error || 'Failed to update profile on backend';
          }
        } catch (err) {
          console.error(err);
          errorMsg = 'Server unreachable';
        }
      }

      if (!backendSuccess && (!token || token === 'mock-jwt-token')) {
        // Save changes to localStorage DB and session (mock fallback)
        const userStr = localStorage.getItem('invibeUser');
        if (userStr) {
          try {
            const currentUser = JSON.parse(userStr);
            const users = JSON.parse(localStorage.getItem('invibe_users_db') || '[]');
            const userIndex = users.findIndex(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
            if (userIndex !== -1) {
              users[userIndex].fullName = newName;
              users[userIndex].username = formattedHandle;
              users[userIndex].bio = newBio;
              users[userIndex].phoneNumber = newPhone;
              users[userIndex].preferred2faMethod = new2faMethod;
              if (currentAvatarUrl) {
                users[userIndex].profileImage = currentAvatarUrl;
              }
              if (currentBannerUrl) {
                users[userIndex].bannerImage = currentBannerUrl;
              }
              localStorage.setItem('invibe_users_db', JSON.stringify(users));

              currentUser.fullName = newName;
              currentUser.username = formattedHandle;
              currentUser.bio = newBio;
              currentUser.phoneNumber = newPhone;
              currentUser.preferred2faMethod = new2faMethod;
              localStorage.setItem('invibeUser', JSON.stringify(currentUser));
              if (currentAvatarUrl) {
                localStorage.setItem('invibeProfileImage', currentAvatarUrl);
              }
              if (currentBannerUrl) {
                localStorage.setItem('invibeBannerImage', currentBannerUrl);
              }
              backendSuccess = true;
            }
          } catch (err) {
            console.error('Error saving profile changes to localStorage:', err);
          }
        }
      }

      if (!backendSuccess) {
        showToast(errorMsg || 'Failed to update profile. ⚠️');
        return;
      }

      const displayHandle = newHandle.startsWith('@') ? newHandle : '@' + newHandle;

      // 1. Update text fields on profile page
      if (profileNameH2) {
        profileNameH2.innerHTML = `${newName} <span class="verified-badge"><i data-lucide="check"></i></span>`;
        debouncedCreateIcons();
      }
      if (profilePreviewNameH3) profilePreviewNameH3.textContent = newName;
      if (profileHandleP) profileHandleP.textContent = displayHandle;
      if (profilePreviewHandleP) profilePreviewHandleP.textContent = displayHandle;
      if (profileBioP) profileBioP.textContent = newBio;

      // 2. Update images
      if (currentAvatarUrl) {
        if (profileLargeAvatar) profileLargeAvatar.src = currentAvatarUrl;
        if (profilePreviewAvatarImg) profilePreviewAvatarImg.src = currentAvatarUrl;
        if (headerAvatarImg) headerAvatarImg.src = currentAvatarUrl;
        
        // Also update story user avatar if needed
        const storyViewerAvatar = document.getElementById('story-viewer-avatar');
        if (storyViewerAvatar) storyViewerAvatar.src = currentAvatarUrl;
      }
      if (currentBannerUrl && profileBannerImg) {
        profileBannerImg.src = currentBannerUrl;
      }

      showToast('Profile updated successfully! ✨');
      closeEditProfileModal();
    });
  }

  // Saved/tagged tabs profile switcher
  const postsTab = document.getElementById('profile-posts-tab');
  const savedTab = document.getElementById('profile-saved-tab');
  const taggedTab = document.getElementById('profile-tagged-tab');
  const profileGrid = document.querySelector('.profile-posts-grid');

  const profileData = {
    posts: [
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=300&q=80"
    ],
    saved: [
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80"
    ],
    tagged: [
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80"
    ]
  };

  function updateProfileGrid(tabName) {
    if (!profileGrid) return;
    const images = profileData[tabName] || [];
    profileGrid.innerHTML = images.map(imgSrc => `
      <div class="grid-post-card">
        <img src="${imgSrc}" alt="Profile item" />
      </div>
    `).join('');
  }

  function handleTabClick(activeTab, tabName, toastMessage) {
    [postsTab, savedTab, taggedTab].forEach(tab => {
      if (tab) tab.classList.remove('active');
    });
    if (activeTab) activeTab.classList.add('active');
    updateProfileGrid(tabName);
    if (toastMessage) showToast(toastMessage);
  }

  if (postsTab) postsTab.addEventListener('click', () => handleTabClick(postsTab, 'posts', 'Loading posts... 📸'));
  if (savedTab) savedTab.addEventListener('click', () => handleTabClick(savedTab, 'saved', 'Loading bookmarks... 🔖'));
  if (taggedTab) taggedTab.addEventListener('click', () => handleTabClick(taggedTab, 'tagged', 'Loading tagged content... 🏷️'));

  const profileOptionButtons = document.querySelectorAll('.profile-option-btn');
  const appearanceToggle = document.getElementById('profile-appearance-toggle');
  const profileLogoutBtn = document.getElementById('profile-logout-btn');

  // --- NEW MODALS SYSTEM ---
  const privacyModal = document.getElementById('privacy-settings-modal');
  const privacyCloseBtn = document.getElementById('privacy-modal-close-btn');
  const privacyCancelBtn = document.getElementById('privacy-modal-cancel-btn');
  const privacySaveBtn = document.getElementById('privacy-modal-save-btn');
  const privacyE2eeToggle = document.getElementById('privacy-e2ee-toggle');
  const privacyHideStoryList = document.getElementById('privacy-hide-story-list');

  const notificationsModal = document.getElementById('notifications-settings-modal');
  const notificationsCloseBtn = document.getElementById('notifications-modal-close-btn');
  const notificationsCancelBtn = document.getElementById('notifications-modal-cancel-btn');
  const notificationsSaveBtn = document.getElementById('notifications-modal-save-btn');

  const helpModal = document.getElementById('help-support-modal');
  const helpCloseBtn = document.getElementById('help-modal-close-btn');
  const helpCancelBtn = document.getElementById('help-modal-cancel-btn');
  const helpSubmitBtn = document.getElementById('help-modal-submit-btn');

  const aboutModal = document.getElementById('about-modal');
  const aboutCloseBtn = document.getElementById('about-modal-close-btn');
  const aboutOkBtn = document.getElementById('about-modal-ok-btn');


  function populatePrivacyStoryList() {
    if (!privacyHideStoryList) return;
    const hubbers = state.stories || [];
    privacyHideStoryList.innerHTML = hubbers.map((user, idx) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${user.avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />
          <span style="font-size: 0.85rem; color: white;">${user.name}</span>
        </div>
        <input type="checkbox" class="hide-story-checkbox" data-username="${user.name}" style="accent-color: var(--accent-gradient, #f35626);" />
      </div>
    `).join('');

    const hiddenUsers = JSON.parse(localStorage.getItem('privacy_hidden_stories') || '[]');
    const checkboxes = privacyHideStoryList.querySelectorAll('.hide-story-checkbox');
    checkboxes.forEach(cb => {
      if (hiddenUsers.includes(cb.dataset.username)) {
        cb.checked = true;
      }
    });
  }

  if (privacyCloseBtn) privacyCloseBtn.addEventListener('click', () => privacyModal.classList.remove('active'));
  if (privacyCancelBtn) privacyCancelBtn.addEventListener('click', () => privacyModal.classList.remove('active'));
  if (privacySaveBtn) {
    privacySaveBtn.addEventListener('click', () => {
      const isE2ee = privacyE2eeToggle ? privacyE2eeToggle.checked : false;
      const hiddenUsers = [];
      if (privacyHideStoryList) {
        const checked = privacyHideStoryList.querySelectorAll('.hide-story-checkbox:checked');
        checked.forEach(cb => hiddenUsers.push(cb.dataset.username));
      }
      localStorage.setItem('privacy_e2ee_enabled', isE2ee);
      localStorage.setItem('privacy_hidden_stories', JSON.stringify(hiddenUsers));
      showToast('Privacy settings updated! 🔒');
      privacyModal.classList.remove('active');
    });
  }

  if (notificationsCloseBtn) notificationsCloseBtn.addEventListener('click', () => notificationsModal.classList.remove('active'));
  if (notificationsCancelBtn) notificationsCancelBtn.addEventListener('click', () => notificationsModal.classList.remove('active'));
  if (notificationsSaveBtn) {
    notificationsSaveBtn.addEventListener('click', () => {
      showToast('Notification settings updated! 🔔');
      notificationsModal.classList.remove('active');
    });
  }

  if (helpCloseBtn) helpCloseBtn.addEventListener('click', () => helpModal.classList.remove('active'));
  if (helpCancelBtn) helpCancelBtn.addEventListener('click', () => helpModal.classList.remove('active'));
  if (helpSubmitBtn) {
    helpSubmitBtn.addEventListener('click', () => {
      const msgVal = document.getElementById('help-message-input')?.value;
      if (msgVal) {
        showToast('Support ticket submitted successfully! 💬');
        if (document.getElementById('help-message-input')) document.getElementById('help-message-input').value = '';
        helpModal.classList.remove('active');
      } else {
        showToast('Please type a message before submitting. ⚠️');
      }
    });
  }

  if (aboutCloseBtn) aboutCloseBtn.addEventListener('click', () => aboutModal.classList.remove('active'));
  if (aboutOkBtn) aboutOkBtn.addEventListener('click', () => aboutModal.classList.remove('active'));



  if (appearanceToggle) {
    appearanceToggle.checked = document.body.classList.contains('light-theme');
    appearanceToggle.addEventListener('change', () => {
      const isLight = appearanceToggle.checked;
      if (isLight) {
        document.body.classList.replace('dark-theme', 'light-theme');
      } else {
        document.body.classList.replace('light-theme', 'dark-theme');
      }
      showToast(isLight ? 'Switched appearance on ☀️' : 'Switched appearance off 🌙');
    });
  }

  profileOptionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      switch (action) {
        case 'edit-profile':
          if (editProfileModal) {
            editProfileModal.classList.add('active');
          }
          break;
        case 'vibe-settings':
          showToast('Opening Hubs Settings... ⚙️');
          switchView('settings');
          break;
        case 'privacy':
          if (privacyModal) {
            populatePrivacyStoryList();
            if (privacyE2eeToggle) {
              privacyE2eeToggle.checked = localStorage.getItem('privacy_e2ee_enabled') === 'true';
            }
            privacyModal.classList.add('active');
          }
          break;
        case 'notifications':
          if (notificationsModal) {
            notificationsModal.classList.add('active');
          }
          break;
        case 'help':
          if (helpModal) {
            helpModal.classList.add('active');
          }
          break;
        case 'about':
          if (aboutModal) {
            aboutModal.classList.add('active');
          }
          break;
        default:
          showToast('Action not available yet.');
      }
    });
  });

  if (profileLogoutBtn) {
    profileLogoutBtn.addEventListener('click', () => {
      localStorage.removeItem('invibeIsLoggedIn');
      localStorage.removeItem('invibeUser');
      localStorage.removeItem('invibeProfileImage');
      localStorage.removeItem('invibe_jwt_token');
      showToast('Logged out successfully. 👋');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }

  // --- REELS SAVE INTERACTION SYSTEM ---
  const reelSaveActionItems = document.querySelectorAll('.reel-save-action');
  const reelThumbnails = {
    "1": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=300&q=80", // Tech Setup (for Coding Reel)
    "2": "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80"  // Mountain Lake (for Offsite Reel)
  };

  reelSaveActionItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const reelId = item.getAttribute('data-reel-id');
      const starBtn = item.querySelector('.action-circle-btn');
      const textSpan = item.querySelector('.action-count');
      const thumbnailSrc = reelThumbnails[reelId];

      if (!starBtn.classList.contains('active')) {
        // Save the Reel
        starBtn.classList.add('active');
        if (textSpan) textSpan.textContent = 'Saved';
        
        // Add to profileData.saved
        if (thumbnailSrc && !profileData.saved.includes(thumbnailSrc)) {
          profileData.saved.unshift(thumbnailSrc); // prepend so it appears first
        }
        
        showToast('Reel saved to profile! ⭐');
      } else {
        // Unsave the Reel
        starBtn.classList.remove('active');
        if (textSpan) textSpan.textContent = 'Save';
        
        // Remove from profileData.saved
        if (thumbnailSrc) {
          const index = profileData.saved.indexOf(thumbnailSrc);
          if (index > -1) {
            profileData.saved.splice(index, 1);
          }
        }
        
        showToast('Reel removed from saved! 🗑️');
      }

      // If the user is currently viewing the 'saved' tab on the profile page, refresh the grid
      if (savedTab && savedTab.classList.contains('active')) {
        updateProfileGrid('saved');
      }
    });
  });

  // Inbox drop items click alerts
  const drGroup = document.getElementById('dr-new-group');
  const drBroad = document.getElementById('dr-new-broad');
  const drInvite = document.getElementById('dr-invite');
  const drScan = document.getElementById('dr-scan');
  const drStarred = document.getElementById('dr-starred');
  const drArchived = document.getElementById('dr-archived');
  const drSettings = document.getElementById('dr-settings');
  const newChatBtn = document.getElementById('new-chat-btn');
  const newChatDropdown = document.getElementById('new-chat-dropdown');

  if (newChatBtn && newChatDropdown) {
    newChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      newChatDropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!newChatDropdown.contains(e.target) && e.target !== newChatBtn) {
        newChatDropdown.classList.remove('active');
      }
    });
  }

  function handleDropdownClick() {
    if (newChatDropdown) {
      newChatDropdown.classList.remove('active');
    }
  }

  if (drGroup) drGroup.addEventListener('click', () => { handleDropdownClick(); showToast('Setup New Chat Group lobby 👥'); });
  if (drBroad) drBroad.addEventListener('click', () => { handleDropdownClick(); showToast('Broadcasting system active 📻'); });
  if (drInvite) drInvite.addEventListener('click', () => { handleDropdownClick(); showToast('Invitation code copied: HUBBLE-2026 🎟️'); });
  if (drScan) drScan.addEventListener('click', () => { handleDropdownClick(); showToast('Access camera feed for QR Scan... 📷'); });
  if (drStarred) drStarred.addEventListener('click', () => { handleDropdownClick(); showToast('Starred message filter active ⭐'); });
  if (drArchived) drArchived.addEventListener('click', () => { handleDropdownClick(); showToast('Archived threads loaded 📦'); });
  if (drSettings) drSettings.addEventListener('click', () => {
    handleDropdownClick();
    switchView('settings');
    showToast('Opening Settings Dashboard... ⚙️');
  });
  // --- DASHBOARD SETTINGS CONTROLLER ---
  const colorPickerDots = document.querySelectorAll('.color-picker-dot');
  const toggleCaustics = document.getElementById('toggle-caustics-checkbox');
  const togglePrivacy = document.getElementById('toggle-privacy-checkbox');
  const toggleNotif = document.getElementById('toggle-notif-checkbox');

  // Theme Accent Picker
  colorPickerDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorPickerDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      
      const selectedColor = dot.getAttribute('data-color');
      document.documentElement.style.setProperty('--primary', selectedColor);
      
      showToast(`Accent color updated! 🎨`);
    });
  });

  // Toggle Caustics Overlay
  if (toggleCaustics) {
    toggleCaustics.addEventListener('change', () => {
      const isEnabled = toggleCaustics.checked;
      if (isEnabled) {
        document.documentElement.style.setProperty('--bg-caustics', 'radial-gradient(circle at 20% 30%, rgba(108, 59, 255, 0.15) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255, 79, 163, 0.1) 0%, transparent 45%)');
        showToast('Ambient caustics enabled ✨');
      } else {
        document.documentElement.style.setProperty('--bg-caustics', 'none');
        showToast('Ambient caustics disabled');
      }
    });
  }

  // Toggles Privacy / Notifications
  if (togglePrivacy) {
    togglePrivacy.addEventListener('change', () => {
      showToast(togglePrivacy.checked ? 'Account set to Private 🔒' : 'Account set to Public 🌐');
    });
  }
  if (toggleNotif) {
    toggleNotif.addEventListener('change', () => {
      showToast(toggleNotif.checked ? 'Notifications Enabled 🔔' : 'Notifications Silenced 🔕');
    });
  }

  // --- COMMENTS & SHARE MODALS CONTROLLER ---
  const mockFriends = [
    { name: "Zoe Lin", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=100&h=100&q=80" },
    { name: "Jamie Sun", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Sarah Chen", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Marcus", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80" },
    { name: "Emma Johnson", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80" }
  ];

  const commentsModal = document.getElementById('comments-modal');
  const shareModal = document.getElementById('share-modal');

  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.story-viewer-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  function openShare(key, modalOverride = shareModal) {
    const modal = modalOverride || shareModal;
    if (!modal) return;

    const shareList = modal.querySelector('.share-friends-list');
    if (!shareList) return;

    renderShareFriends(key, modal, shareList);
    modal.classList.add('active');
  }

  async function renderShareFriends(key, modal = shareModal, shareList = null) {
    const list = shareList || modal?.querySelector('.share-friends-list');
    if (!list) return;

    list.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-muted);">Loading Hubbies...</div>';
    
    const token = localStorage.getItem('invibe_jwt_token');
    const currentUser = getCurrentUser();
    if (!token || !currentUser) {
      list.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-muted);">Please log in to share.</div>';
      return;
    }

    try {
      const targetId = currentUser.id || currentUser._id;
      const res = await fetch(`${API_URL}/api/users/${targetId}/following-list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const users = await res.json();

      list.innerHTML = '';

      if (users.length === 0) {
        list.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-muted); text-align:center;">No hubbies found. Follow someone to share!</div>';
        return;
      }

      users.forEach(u => {
        if (!u) return;

        const card = document.createElement('div');
        card.className = 'share-friend-card';
        card.innerHTML = `
          <img src="${u.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}" class="share-friend-avatar" alt="${u.fullName}" />
          <span class="share-friend-name">${u.fullName}</span>
        `;
        
        card.addEventListener('click', async () => {
          const currentUser = getCurrentUser();
          if (!currentUser) return;

          const secretKey = getChatSecretKey(currentUser.id || currentUser._id, u._id);
          const isReel = key.startsWith('reel');
          
          let sharedContentHtml = '';
          if (isReel) {
            sharedContentHtml = `<div class="shared-hub-card reel" data-shared-id="${key}"><i data-lucide="video" style="display:inline-block; vertical-align:middle; margin-right:4px;"></i> Shared a Reel</div>`;
          } else {
            sharedContentHtml = `<div class="shared-hub-card post" data-shared-id="${key}"><i data-lucide="image" style="display:inline-block; vertical-align:middle; margin-right:4px;"></i> Shared a Post</div>`;
          }

          const encryptedText = encryptMessage(sharedContentHtml, secretKey);

          try {
            const sendRes = await fetch(`${API_URL}/api/chats/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                recipient: u._id,
                content: encryptedText,
                mediaUrl: key,
                mediaType: 'hub',
                mediaName: isReel ? 'Shared Reel' : 'Shared Post',
                mediaSize: 'Link'
              })
            });
            if (!sendRes.ok) throw new Error();

            showToast(`Shared successfully to ${u.fullName}! ✈️`);
            if (modal) modal.classList.remove('active');
            
            loadChatThreads();
            if (state.currentChatThread && state.currentChatThread.toString() === u._id.toString()) {
              await fetchMessages(u._id, true);
            }
          } catch (err) {
            console.error('Error sharing hub content:', err);
            showToast('Failed to share item.');
          }
        });
        
        list.appendChild(card);
      });
    } catch (err) {
      console.error('Error rendering friends share list:', err);
      list.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-muted);">Failed to load friends.</div>';
    }
  }

  // Handle comment click events (focuses the inline comment input field on dynamic posts or opens modal)
  let currentCommentPostId = null;
  
  if (commentsModal) {
    const sendBtn = commentsModal.querySelector('.comment-send-btn');
    const inputField = commentsModal.querySelector('input');
    
    if (sendBtn && inputField) {
      sendBtn.addEventListener('click', async () => {
        const text = inputField.value.trim();
        if (text && currentCommentPostId) {
          await submitComment(currentCommentPostId, text, inputField);
        }
      });
      inputField.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const text = inputField.value.trim();
          if (text && currentCommentPostId) {
            await submitComment(currentCommentPostId, text, inputField);
          }
        }
      });
    }
  }

  document.addEventListener('click', (e) => {
    const commentBtn = e.target.closest('.comment-btn-action');
    if (commentBtn) {
      e.preventDefault();
      e.stopPropagation();

      const pid = commentBtn.getAttribute('data-post-id') || commentBtn.closest('[data-post-id]')?.getAttribute('data-post-id') || '1';
      const card = commentBtn.closest('.feed-card');
      const inlineInput = card ? card.querySelector('.comment-input-field') : null;
      
      if (inlineInput) {
        inlineInput.focus();
        inlineInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (commentsModal) {
        currentCommentPostId = pid;
        commentsModal.classList.add('active');
        const inputField = commentsModal.querySelector('input');
        if (inputField) inputField.focus();
      }
    }
  });

  // Share trigger click
  document.addEventListener('click', async (e) => {
    const shareBtn = e.target.closest('.share-btn-action, .reel-share-sim, .share-btn, .feed-share-btn');
    if (shareBtn) {
      e.preventDefault();
      e.stopPropagation();
      
      const urlToShare = window.location.href;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Check this out on HI-HUBBLE',
            url: urlToShare
          });
        } catch (err) {
          console.log('Error sharing:', err);
        }
      } else {
        try {
          await navigator.clipboard.writeText(urlToShare);
          showToast('Link copied');
        } catch (err) {
          console.error('Failed to copy', err);
        }
      }
    }
  });

  // ─── LIVE MONGO DATABASE SYSTEMS INTEGRATION ───
  
  async function loadFeedPosts() {
    const feedContainer = document.getElementById('home-feed-posts');
    if (!feedContainer) return;

    try {
      const res = await fetch(`${API_URL}/api/posts`);
      if (!res.ok) throw new Error('Failed to fetch posts');
      const posts = await res.json();

      const emptyState = document.getElementById('feed-empty-state');
      feedContainer.innerHTML = '';
      if (emptyState) feedContainer.appendChild(emptyState);

      if (posts.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
      } else {
        if (emptyState) emptyState.style.display = 'none';
      }

      const currentUserStr = localStorage.getItem('invibeUser');
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;

      posts.forEach(post => {
        const isLikedByMe = currentUser ? post.likes.includes(currentUser.id) : false;
        
        const card = document.createElement('article');
        card.className = 'feed-card';
        card.id = `post-${post._id}`;
        card.setAttribute('data-tags', 'all chill');

        let commentsHTML = '';
        post.comments.forEach(comment => {
          commentsHTML += `
            <div class="comment-item" style="display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px;">
              <img src="${comment.author.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" />
              <div>
                <strong style="color: var(--text-color); margin-right: 4px;">${comment.author.username}</strong>
                <span style="color: var(--text-muted);">${comment.text}</span>
              </div>
            </div>
          `;
        });

        card.innerHTML = `
          <div class="post-header">
            <div class="post-author-info">
              <img src="${post.author.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="${post.author.fullName}" class="author-avatar" />
              <div>
                <h4 class="author-name">${post.author.fullName} <span class="verified-badge"><i data-lucide="check"></i></span></h4>
                <div class="post-meta">
                  <span class="post-time">${new Date(post.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  <span class="dot-separator">•</span>
                  <i data-lucide="globe" class="meta-icon"></i>
                </div>
              </div>
            </div>
            <button class="post-options-btn"><i data-lucide="more-horizontal"></i></button>
          </div>

          <div class="post-media-container" style="position:relative; overflow:hidden; border-radius: 12px; margin: 12px 0;">
            ${post.mediaType === 'video'
              ? `<video src="${post.mediaUrl}" loop muted playsinline style="width:100%; border-radius:12px; display:block;" class="post-media-video"></video>
                 <div class="video-play-overlay">
                   <button class="play-btn-big"><i data-lucide="play"></i></button>
                 </div>`
              : `<img src="${post.mediaUrl}" alt="Post Media" style="width:100%; border-radius:12px; display:block;" />`
            }
            <div class="double-tap-heart"><i data-lucide="heart"></i></div>

            <!-- Vertical engagement overlay right aligned -->
            <div class="post-engagement-actions">
              <div class="engagement-item like-btn-action ${isLikedByMe ? 'liked' : ''}" data-post-id="${post._id}">
                <button class="action-circle-btn heart-btn"><i data-lucide="heart" style="${isLikedByMe ? 'fill:#8b5cf6; stroke:#8b5cf6;' : ''}"></i></button>
                <span class="action-count">${post.likes.length}</span>
              </div>
              <div class="engagement-item comment-btn-action" data-post-id="${post._id}">
                <button class="action-circle-btn"><i data-lucide="message-circle"></i></button>
                <span class="action-count">${post.comments.length}</span>
              </div>
              <div class="engagement-item share-btn-action" data-post-id="${post._id}">
                <button class="action-circle-btn"><i data-lucide="send"></i></button>
              </div>
              <div class="engagement-item bookmark-btn-action" data-post-id="${post._id}">
                <button class="action-circle-btn bookmark-btn"><i data-lucide="bookmark"></i></button>
              </div>
            </div>
          </div>

          <div class="post-details">
            <p class="post-caption"><strong class="author-username" style="margin-right: 8px;">${post.author.username}</strong>${post.caption}</p>
            
            <div class="comments-section" style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 12px;">
              <div class="comments-list" id="comments-list-${post._id}">
                ${commentsHTML}
              </div>
              
              <div class="post-comment-input-area" style="display: flex; gap: 8px; margin-top: 12px;">
                <input type="text" placeholder="Add a comment..." class="comment-input-field" id="comment-input-${post._id}" style="flex:1; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px; padding: 8px 16px; color: var(--text-color); font-size: 13px;" />
                <button class="send-comment-btn" data-post-id="${post._id}" style="background: var(--primary-color); border:none; color:white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                  <i data-lucide="send" style="width:14px; height:14px;"></i>
                </button>
              </div>
            </div>
          </div>
        `;

        feedContainer.appendChild(card);

        // Click handlers to view post author profile
        const avatarEl = card.querySelector('.author-avatar');
        const nameEl = card.querySelector('.author-name');
        const usernameEl = card.querySelector('.author-username');

        [avatarEl, nameEl, usernameEl].forEach(el => {
          if (el) {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
              switchView('profile', post.author._id);
            });
          }
        });
      });

      debouncedCreateIcons();

      // Local Like and Bookmark listeners removed in favor of global event delegation

      const dynamicVideoOverlays = feedContainer.querySelectorAll('.video-play-overlay');
      dynamicVideoOverlays.forEach(overlay => {
        overlay.addEventListener('click', () => {
          const container = overlay.closest('.post-media-container');
          const video = container.querySelector('.post-media-video');
          const playIcon = overlay.querySelector('i');
          if (video.paused) {
            video.play();
            playIcon.setAttribute('data-lucide', 'pause');
            overlay.style.background = 'rgba(0,0,0,0)';
            overlay.style.opacity = '0';
          } else {
            video.pause();
            playIcon.setAttribute('data-lucide', 'play');
            overlay.style.background = 'rgba(0,0,0,0.25)';
            overlay.style.opacity = '1';
          }
          debouncedCreateIcons();
        });
      });

      const mediaBoxes = feedContainer.querySelectorAll('.post-media-container');
      mediaBoxes.forEach(container => {
        let lastTap = 0;
        container.addEventListener('click', async (e) => {
          if (e.target.closest('.post-engagement-actions')) return; // ignore clicks on engagement overlays
          const now = Date.now();
          const timespan = now - lastTap;
          if (timespan < 300 && timespan > 0) {
            e.preventDefault();
            const btn = container.closest('.feed-card').querySelector('.like-btn-action');
            const pid = btn.getAttribute('data-post-id');
            const doubleHeart = container.querySelector('.double-tap-heart');
            
            const rect = container.getBoundingClientRect();
            const relativeX = e.clientX - rect.left;
            const relativeY = e.clientY - rect.top;

            if (doubleHeart) {
              doubleHeart.style.left = `${relativeX}px`;
              doubleHeart.style.top = `${relativeY}px`;
              doubleHeart.classList.remove('animate');
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  doubleHeart.classList.add('animate');
                });
              });
            }

            if (!btn.classList.contains('liked')) {
              await togglePostLike(pid, btn);
            }
          }
          lastTap = now;
        });
      });

      const commentSendButtons = feedContainer.querySelectorAll('.send-comment-btn');
      commentSendButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const pid = btn.getAttribute('data-post-id');
          const input = document.getElementById(`comment-input-${pid}`);
          const text = input.value.trim();
          if (text) {
            await submitComment(pid, text, input);
          }
        });
      });

      const commentInputs = feedContainer.querySelectorAll('.comment-input-field');
      commentInputs.forEach(input => {
        input.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const pid = input.id.replace('comment-input-', '');
            const text = input.value.trim();
            if (text) {
              await submitComment(pid, text, input);
            }
          }
        });
      });

    } catch (err) {
      console.error('Error loading posts:', err);
    }
  }

  async function togglePostLike(postId, btnElement) {
    const token = localStorage.getItem('invibe_jwt_token');
    let useFrontendFallback = false;

    if (!token) {
      useFrontendFallback = true;
    }

    try {
      if (useFrontendFallback) throw new Error('No token');
      const res = await fetch(`${API_URL}/api/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const countSpan = btnElement.querySelector('.action-count');
      const heartIcon = btnElement.querySelector('i, svg');

      if (data.isLiked) {
        btnElement.classList.add('liked');
        if (heartIcon) {
          heartIcon.style.fill = '#8b5cf6';
          heartIcon.style.stroke = '#8b5cf6';
        }
        showToast('Liked post! 💜');
      } else {
        btnElement.classList.remove('liked');
        if (heartIcon) {
          heartIcon.style.fill = 'none';
          heartIcon.style.stroke = 'currentColor';
        }
      }
      if (countSpan) countSpan.textContent = data.likesCount;
    } catch (err) {
      // Fallback to frontend-only state
      const isLiked = btnElement.classList.contains('liked');
      const countSpan = btnElement.querySelector('.action-count');
      const heartIcon = btnElement.querySelector('i, svg');
      
      let count = parseInt(countSpan ? countSpan.textContent : '0') || 0;

      if (!isLiked) {
        btnElement.classList.add('liked');
        if (heartIcon) {
          heartIcon.style.fill = '#8b5cf6';
          heartIcon.style.stroke = '#8b5cf6';
        }
        if (countSpan) countSpan.textContent = count + 1;
        showToast('Liked post! 💜');
      } else {
        btnElement.classList.remove('liked');
        if (heartIcon) {
          heartIcon.style.fill = 'none';
          heartIcon.style.stroke = 'currentColor';
        }
        if (countSpan && count > 0) countSpan.textContent = count - 1;
      }
    }
  }

  async function submitComment(postId, text, inputField) {
    const token = localStorage.getItem('invibe_jwt_token');
    let useFrontendFallback = false;

    if (!token) {
      useFrontendFallback = true;
    }

    try {
      if (useFrontendFallback) throw new Error('No token');
      const res = await fetch(`${API_URL}/api/posts/${postId}/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });
      const comments = await res.json();
      if (!res.ok) throw new Error(comments.error);

      inputField.value = '';
      
      const card = document.getElementById(`post-${postId}`) || inputField.closest('.feed-card') || document.querySelector(`[data-post-id="${postId}"]`)?.closest('.feed-card');
      if (card) {
        const countBadge = card.querySelector('.comment-btn-action .action-count');
        if (countBadge) countBadge.textContent = comments.length;
      }

      const listContainer = document.getElementById(`comments-list-${postId}`) || document.querySelector('#comments-modal .comments-list');
      if (listContainer) {
        listContainer.innerHTML = '';
        comments.forEach(comment => {
          const item = document.createElement('div');
          item.className = 'comment-item';
          item.style = 'display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px;';
          item.innerHTML = `
            <img src="${comment.author.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" />
            <div>
              <strong style="color: var(--text-color); margin-right: 4px;">${comment.author.username}</strong>
              <span style="color: var(--text-muted);">${comment.text}</span>
            </div>
          `;
          listContainer.appendChild(item);
        });
      }
      showToast('Comment posted! 💬');
    } catch (err) {
      // Fallback to frontend-only state
      inputField.value = '';
      
      const card = document.getElementById(`post-${postId}`) || inputField.closest('.feed-card') || document.querySelector(`[data-post-id="${postId}"]`)?.closest('.feed-card');
      if (card) {
        const countBadge = card.querySelector('.comment-btn-action .action-count');
        if (countBadge) {
          const count = parseInt(countBadge.textContent || '0');
          countBadge.textContent = count + 1;
        }
      }

      const listContainer = document.getElementById(`comments-list-${postId}`) || document.querySelector('#comments-modal .comments-list');
      if (listContainer) {
        const userStr = localStorage.getItem('invibeUser');
        const user = userStr ? JSON.parse(userStr) : { username: 'Guest', profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80' };
        const item = document.createElement('div');
        item.className = 'comment-item';
        item.style = 'display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px;';
        item.innerHTML = `
          <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" />
          <div>
            <strong style="color: var(--text-color); margin-right: 4px;">${user.username}</strong>
            <span style="color: var(--text-muted);">${text}</span>
          </div>
        `;
        listContainer.appendChild(item);
      }
      showToast('Comment posted! 💬');
    }
  }

  async function loadFeedReels() {
    const scroller = document.querySelector('#explore-reels-container .reels-scroller');
    if (!scroller) return;

    try {
      const res = await fetch(`${API_URL}/api/reels`);
      if (!res.ok) throw new Error('Failed to fetch reels');
      const reels = await res.json();

      scroller.innerHTML = '';
      
      const currentUserStr = localStorage.getItem('invibeUser');
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;

      reels.forEach(reel => {
        const isLikedByMe = currentUser ? reel.likes.includes(currentUser.id) : false;

        const card = document.createElement('div');
        card.className = 'reel-card';
        card.innerHTML = `
          <video src="${reel.videoUrl}" loop muted playsinline class="reel-video"></video>
          <div class="reel-play-icon-overlay"><i data-lucide="play"></i></div>
          
          <div class="double-tap-heart"><i data-lucide="heart"></i></div>
          
          <div class="reel-overlay">
            <div class="reel-left-info">
              <div class="reel-user">
                <img src="${reel.author.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80'}" alt="${reel.author.fullName}" />
                <span>${reel.author.username} • <strong class="reel-follow-btn" data-author-id="${reel.author._id}">Follow</strong></span>
              </div>
              <p class="reel-caption">${reel.caption}</p>
              <div class="reel-music"><i data-lucide="music" class="music-icon-spin"></i> <span>Original Audio - ${reel.author.username}</span></div>
            </div>
            <div class="reel-right-actions">
              <div class="reel-actions-capsule">
                <div class="reel-action-btn reel-like-action" data-reel-id="${reel._id}">
                  <button class="action-circle-btn heart-btn ${isLikedByMe ? 'liked' : ''}"><i data-lucide="heart" style="${isLikedByMe ? 'fill:#8b5cf6; stroke:#8b5cf6;' : ''}"></i></button>
                  <span class="action-count">${reel.likes.length}</span>
                </div>
                <div class="reel-action-btn reel-comment-sim">
                  <button class="action-circle-btn"><i data-lucide="message-square"></i></button>
                  <span class="action-count">1.2K</span>
                </div>
                <div class="reel-action-btn reel-share-sim">
                  <button class="action-circle-btn"><i data-lucide="send"></i></button>
                </div>
                <div class="reel-action-btn">
                  <button class="action-circle-btn"><i data-lucide="more-vertical"></i></button>
                </div>
              </div>
            </div>
          </div>

          <div class="story-viewer-overlay reel-comments-modal">
            <div class="comments-card glass-panel">
              <div class="modal-header">
                <h3>Comments</h3>
                <button class="modal-close-btn"><i data-lucide="x"></i></button>
              </div>
              <div class="comments-list" id="comments-list-${reel._id}"></div>
              <div class="comments-footer">
                <input type="text" placeholder="Add a comment..." />
                <button class="comment-send-btn"><i data-lucide="send"></i></button>
              </div>
            </div>
          </div>

          <div class="story-viewer-overlay reel-share-modal">
            <div class="share-card glass-panel">
              <div class="modal-header">
                <h3>Share to Friends</h3>
                <button class="modal-close-btn"><i data-lucide="x"></i></button>
              </div>
              <div class="share-friends-list"></div>
            </div>
          </div>
        `;

        scroller.appendChild(card);
      });

      debouncedCreateIcons();
      wireReelInteractions(scroller);

    } catch (err) {
      console.error('Error loading reels:', err);
    }
  }

  async function toggleReelLike(reelId, btnElement) {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) {
      showToast('Please log in to like reels! 🔐');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/reels/${reelId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const countSpan = btnElement.closest('.reel-action-btn').querySelector('.action-count');
      const heartIcon = btnElement.querySelector('i, svg');

      if (data.isLiked) {
        btnElement.classList.add('liked');
        if (heartIcon) {
          heartIcon.style.fill = '#8b5cf6';
          heartIcon.style.stroke = '#8b5cf6';
        }
        showToast('Liked Reel! 💜');
      } else {
        btnElement.classList.remove('liked');
        if (heartIcon) {
          heartIcon.style.fill = 'none';
          heartIcon.style.stroke = 'currentColor';
        }
      }
      if (countSpan) countSpan.textContent = data.likesCount;
    } catch (err) {
      console.error('Error liking reel:', err);
      showToast(err.message);
    }
  }

  async function toggleFollowFromReel(authorId, btnElement) {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) {
      showToast('Please log in to follow users! 🔐');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/users/${authorId}/follow`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      btnElement.textContent = 'Hubbies';
      btnElement.style.background = 'rgba(255,255,255,0.2)';
      showToast(data.message || 'Followed successfully!');
      loadProfileStats();
      loadFollowSuggestions();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function loadFollowSuggestions() {
    const listContainer = document.querySelector('.suggested-users-list');
    if (!listContainer) return;

    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/users/suggestions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      const suggestions = await res.json();

      listContainer.innerHTML = '';
      if (suggestions.length === 0) {
        listContainer.innerHTML = '<p style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">No suggestions available</p>';
        return;
      }

      suggestions.forEach(user => {
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = `
          <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="${user.fullName}" class="user-row-avatar" style="cursor: pointer;" />
          <div class="user-row-info" style="cursor: pointer;">
            <h5>${user.fullName}</h5>
            <p>@${user.username}</p>
          </div>
          <button class="follow-row-btn" data-user-id="${user._id}">Follow</button>
        `;
        listContainer.appendChild(row);

        // Click handlers to view user profile
        const avatarImg = row.querySelector('.user-row-avatar');
        const infoDiv = row.querySelector('.user-row-info');
        [avatarImg, infoDiv].forEach(el => {
          el.addEventListener('click', () => {
            switchView('profile', user._id);
          });
        });
      });

      const followButtons = listContainer.querySelectorAll('.follow-row-btn');
      followButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const uid = btn.getAttribute('data-user-id');
          await toggleFollowUser(uid, btn);
        });
      });
    } catch (err) {
      console.error('Error loading suggestions:', err);
    }
  }

  async function toggleFollowUser(targetUserId, btnElement) {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    const isFollowing = btnElement.classList.contains('followed');
    const endpoint = isFollowing ? 'unfollow' : 'follow';

    try {
      const res = await fetch(`${API_URL}/api/users/${targetUserId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (endpoint === 'follow') {
        btnElement.classList.add('followed');
        btnElement.textContent = 'Hubbies';
        showToast(data.message || 'Followed successfully!');
      } else {
        btnElement.classList.remove('followed');
        btnElement.textContent = 'Follow';
        showToast('Unfollowed successfully.');
      }
      loadProfileStats();
      loadFollowSuggestions();
    } catch (err) {
      showToast(err.message);
    }
  }

  // --- SUGGESTED VIBERS MODAL SYSTEM ---
  const suggestedVibersModal = document.getElementById('suggested-vibers-modal');
  const suggestedVibersCloseBtn = document.getElementById('suggested-vibers-close-btn');
  const suggestedVibersContent = document.getElementById('suggested-vibers-content');

  if (suggestedVibersCloseBtn && suggestedVibersModal) {
    suggestedVibersCloseBtn.addEventListener('click', () => {
      suggestedVibersModal.classList.remove('active');
    });
  }

  async function openSuggestedVibersModal() {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    suggestedVibersContent.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Loading suggestions...</div>';
    suggestedVibersModal.classList.add('active');

    try {
      // Query with limit=50 to show more suggestions in the modal
      const res = await fetch(`${API_URL}/api/users/suggestions?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load suggestions');
      const suggestions = await res.json();

      suggestedVibersContent.innerHTML = '';
      if (suggestions.length === 0) {
        suggestedVibersContent.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">No suggestions available</div>`;
        return;
      }

      suggestions.forEach(user => {
        const row = document.createElement('div');
        row.className = 'search-person-row';
        row.style.margin = '10px 0';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';

        row.innerHTML = `
          <div class="person-info" style="display: flex; align-items: center; cursor: pointer;">
            <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="${user.fullName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px;" />
            <div style="display: flex; flex-direction: column;">
              <strong style="font-size: 14px; color: var(--text-color);">${user.fullName}</strong>
              <span style="font-size: 12px; color: var(--text-muted);">@${user.username}</span>
            </div>
          </div>
          <button class="search-follow-btn modal-suggest-follow-btn" data-user-id="${user._id}">
            Follow
          </button>
        `;

        row.querySelector('.person-info').addEventListener('click', () => {
          suggestedVibersModal.classList.remove('active');
          switchView('profile', user._id);
        });

        const followBtn = row.querySelector('.modal-suggest-follow-btn');
        if (followBtn) {
          followBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uid = followBtn.getAttribute('data-user-id');
            const isFollowing = followBtn.classList.contains('followed');
            const endpoint = isFollowing ? 'unfollow' : 'follow';

            try {
              const res = await fetch(`${API_URL}/api/users/${uid}/${endpoint}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);

              if (endpoint === 'follow') {
                followBtn.classList.add('followed');
                followBtn.textContent = 'Hubbies';
                showToast(data.message || 'Followed successfully!');
              } else {
                followBtn.classList.remove('followed');
                followBtn.textContent = 'Follow';
                showToast('Unfollowed successfully.');
              }
              
              loadProfileStats();
              loadFollowSuggestions();
            } catch (err) {
              showToast(err.message);
            }
          });
        }

        suggestedVibersContent.appendChild(row);
      });

      debouncedCreateIcons();
    } catch (err) {
      console.error(err);
      suggestedVibersContent.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--error-color);">Error loading suggestions</div>';
    }
  }

  // --- ACTIVE VIBERS (REAL-TIME presence) ---
  const activeVibersCount = document.getElementById('active-vibers-count');
  const activeVibersList = document.getElementById('active-vibers-list');

  async function loadActiveVibers() {
    if (!activeVibersList) return;
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/users/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch active vibers');
      const activeUsers = await res.json();

      activeVibersList.innerHTML = '';
      if (activeVibersCount) {
        activeVibersCount.textContent = `${activeUsers.length} online`;
      }

      if (activeUsers.length === 0) {
        activeVibersList.innerHTML = '<p style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px; width: 100%;">No hubbers online</p>';
        return;
      }

      activeUsers.forEach(user => {
        const circle = document.createElement('div');
        circle.className = 'face-circle online';
        circle.style.cursor = 'pointer';
        circle.title = `${user.fullName} (@${user.username})`;
        circle.innerHTML = `<img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}" alt="${user.fullName}" />`;
        
        circle.addEventListener('click', () => {
          switchView('profile', user._id);
        });

        activeVibersList.appendChild(circle);
      });
    } catch (err) {
      console.error('Error loading active vibers:', err);
    }
  }

  // Poll for active users every 30 seconds
  setInterval(loadActiveVibers, 30000);

  async function loadProfileStats() {
    const currentUserStr = localStorage.getItem('invibeUser');
    if (!currentUserStr) return;
    const currentUser = JSON.parse(currentUserStr);

    try {
      const res = await fetch(`${API_URL}/api/users/${currentUser.id || currentUser._id}/relations`);
      if (!res.ok) throw new Error('Failed to fetch user relations');
      const data = await res.json();

      const sidebarFollowers = document.getElementById('user-followers-count');
      const sidebarFollowing = document.getElementById('user-following-count');
      if (sidebarFollowers) sidebarFollowers.textContent = formatCount(data.followersCount);
      if (sidebarFollowing) sidebarFollowing.textContent = formatCount(data.followingCount);

      const followBtn = document.getElementById('profile-follow-btn');
      const isViewingSelf = !followBtn || followBtn.style.display === 'none';

      if (isViewingSelf) {
        const profileFollowers = document.getElementById('profile-followers-count');
        const profileFollowing = document.getElementById('profile-following-count');
        if (profileFollowers) profileFollowers.textContent = formatCount(data.followersCount);
        if (profileFollowing) profileFollowing.textContent = formatCount(data.followingCount);

        const postsRes = await fetch(`${API_URL}/api/posts`);
        if (postsRes.ok) {
          const posts = await postsRes.json();
          const userPostsCount = posts.filter(p => {
            const authorId = p.author._id || p.author;
            const currentId = currentUser.id || currentUser._id;
            return authorId === currentId;
          }).length;
          const profileVibes = document.getElementById('profile-vibes-count');
          if (profileVibes) profileVibes.textContent = userPostsCount;
        }
      }
    } catch (err) {
      console.error('Error loading profile stats:', err);
    }
  }

  function formatCount(num) {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
  }

  function wireReelInteractions(scroller) {
    const cards = scroller.querySelectorAll('.reel-card');
    cards.forEach(card => {
      const video = card.querySelector('.reel-video');
      const playPop = card.querySelector('.reel-play-icon-overlay');
      const likeBtn = card.querySelector('.reel-like-action .heart-btn');
      const reelId = card.querySelector('.reel-like-action')?.getAttribute('data-reel-id');

      card.addEventListener('click', (e) => {
        if (e.detail > 1) return;
        if (e.target.closest('.reel-right-actions')) return;

        if (video.paused) {
          video.play();
          playPop.classList.remove('active');
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              playPop.querySelector('i').setAttribute('data-lucide', 'play');
              playPop.classList.add('active');
            });
          });
        } else {
          video.pause();
          playPop.classList.remove('active');
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              playPop.querySelector('i').setAttribute('data-lucide', 'pause');
              playPop.classList.add('active');
            });
          });
        }
        debouncedCreateIcons();
      });

      let lastReelTap = 0;
      card.addEventListener('click', async (e) => {
        const now = Date.now();
        const timespan = now - lastReelTap;
        if (timespan < 300 && timespan > 0) {
          e.preventDefault();
          const rect = card.getBoundingClientRect();
          const relativeX = e.clientX - rect.left;
          const relativeY = e.clientY - rect.top;

          const doubleHeart = card.querySelector('.double-tap-heart');
          if (doubleHeart) {
            doubleHeart.style.left = `${relativeX}px`;
            doubleHeart.style.top = `${relativeY}px`;
            doubleHeart.classList.remove('animate');
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                doubleHeart.classList.add('animate');
              });
            });
          }

          if (likeBtn && !likeBtn.classList.contains('liked')) {
            await toggleReelLike(reelId, likeBtn);
          } else {
            triggerHeartExplosion(relativeX, relativeY, card);
          }
        }
        lastReelTap = now;
      });

      const likeBtnAction = card.querySelector('.reel-like-action');
      if (likeBtnAction && likeBtn) {
        likeBtnAction.addEventListener('click', async (e) => {
          e.stopPropagation();
          await toggleReelLike(reelId, likeBtn);
        });
      }

      const followReel = card.querySelector('.reel-follow-btn');
      if (followReel) {
        followReel.addEventListener('click', async (e) => {
          e.stopPropagation();
          const authorId = followReel.getAttribute('data-author-id');
          await toggleFollowFromReel(authorId, followReel);
        });
      }

      const commentBtn = card.querySelector('.reel-comment-sim');
      const commentModal = card.querySelector('.reel-comments-modal');
      if (commentBtn && commentModal) {
        commentBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          commentModal.classList.add('active');
        });
        const closeBtn = commentModal.querySelector('.modal-close-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            commentModal.classList.remove('active');
          });
        }
        commentModal.addEventListener('click', (e) => {
          if (e.target === commentModal) {
            commentModal.classList.remove('active');
          }
        });

        const sendBtn = commentModal.querySelector('.comment-send-btn');
        const inputField = commentModal.querySelector('input');
        if (sendBtn && inputField) {
          const handleSend = async () => {
            const text = inputField.value.trim();
            if (text) {
              await submitComment(reelId, text, inputField);
            }
          };
          sendBtn.addEventListener('click', handleSend);
          inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          });
        }
      }

      const shareBtn = card.querySelector('.reel-share-sim');
      const shareModal = card.querySelector('.reel-share-modal');
      if (shareBtn && shareModal) {
        shareBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openShare('reel_' + reelId, shareModal);
        });
        const closeBtn = shareModal.querySelector('.modal-close-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            shareModal.classList.remove('active');
          });
        }
        shareModal.addEventListener('click', (e) => {
          if (e.target === shareModal) {
            shareModal.classList.remove('active');
          }
        });
      }

      const capsule = card.querySelector('.reel-actions-capsule');
      if (capsule) {
        let isDraggingCapsule = false;
        let wasDragging = false;
        let startX, startY;
        let posX = 0;
        let posY = 0;

        capsule.addEventListener('mousedown', dragStart);
        capsule.addEventListener('touchstart', dragStart, { passive: false });

        capsule.addEventListener('click', (e) => {
          if (wasDragging) {
            e.stopPropagation();
            e.preventDefault();
          }
        }, true);

        function dragStart(e) {
          if (e.type === 'mousedown' && e.button !== 0) return;
          isDraggingCapsule = false;
          wasDragging = false;
          const coords = getDragCoords(e);
          startX = coords.x;
          startY = coords.y;
          posX = parseFloat(capsule.getAttribute('data-x')) || 0;
          posY = parseFloat(capsule.getAttribute('data-y')) || 0;
          capsule.style.transition = 'none';
          capsule.classList.add('dragging-capsule');
          document.addEventListener('mousemove', dragMove);
          document.addEventListener('mouseup', dragEnd);
          document.addEventListener('touchmove', dragMove, { passive: false });
          document.addEventListener('touchend', dragEnd);
        }

        function dragMove(e) {
          const coords = getDragCoords(e);
          const deltaX = coords.x - startX;
          const deltaY = coords.y - startY;

          if (!isDraggingCapsule) {
            if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
              isDraggingCapsule = true;
              wasDragging = true;
            }
          }

          if (isDraggingCapsule) {
            if (e.cancelable) e.preventDefault();
            let targetX = posX + deltaX;
            let targetY = posY + deltaY;
            const cardRect = card.getBoundingClientRect();
            const capsuleRect = capsule.getBoundingClientRect();
            const curX = parseFloat(capsule.getAttribute('data-x')) || 0;
            const curY = parseFloat(capsule.getAttribute('data-y')) || 0;
            const initialLeft = capsuleRect.left - curX;
            const initialTop = capsuleRect.top - curY;

            const minX = cardRect.left - initialLeft + 12;
            const maxX = cardRect.right - capsuleRect.width - initialLeft - 12;
            const minY = cardRect.top - initialTop + 12;
            const maxY = cardRect.bottom - capsuleRect.height - initialTop - 12;

            targetX = Math.max(minX, Math.min(maxX, targetX));
            targetY = Math.max(minY, Math.min(maxY, targetY));

            capsule.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) scale(1.05)`;
            capsule.setAttribute('data-target-x', targetX.toString());
            capsule.setAttribute('data-target-y', targetY.toString());
          }
        }

        function dragEnd() {
          document.removeEventListener('mousemove', dragMove);
          document.removeEventListener('mouseup', dragEnd);
          document.removeEventListener('touchmove', dragMove);
          document.removeEventListener('touchend', dragEnd);

          capsule.style.transition = '';
          capsule.classList.remove('dragging-capsule');

          if (isDraggingCapsule) {
            const finalX = parseFloat(capsule.getAttribute('data-target-x')) || 0;
            const finalY = parseFloat(capsule.getAttribute('data-target-y')) || 0;
            capsule.setAttribute('data-x', finalX.toString());
            capsule.setAttribute('data-y', finalY.toString());
            capsule.style.transform = `translate3d(${finalX}px, ${finalY}px, 0)`;
            showToast('Repositioned Reels menu! ⚓');
            setTimeout(() => {
              wasDragging = false;
              isDraggingCapsule = false;
            }, 50);
          } else {
            capsule.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;
            isDraggingCapsule = false;
            wasDragging = false;
          }
        }
      }
    });
  }

  // --- USER PROFILE LOADER SYSTEM ---
  async function loadUserProfile(userId) {
    const token = localStorage.getItem('invibe_jwt_token');
    const currentUserStr = localStorage.getItem('invibeUser');
    if (!token || !currentUserStr) return;
    const currentUser = JSON.parse(currentUserStr);
    const isMe = (userId === currentUser.id || userId === currentUser._id || userId === 'me');

    // Immediately reset UI to show loading state and prevent showing stale profile of the previous user
    const profileAvatar = document.querySelector('.profile-screen-avatar');
    if (profileAvatar) profileAvatar.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80';
    
    const profileName = document.querySelector('.profile-summary-top h3');
    if (profileName) profileName.innerHTML = 'Loading Profile...';
    
    const profileHandle = document.querySelector('.profile-screen-handle');
    if (profileHandle) profileHandle.textContent = '@...';

    const followersCount = document.getElementById('profile-followers-count');
    const followingCount = document.getElementById('profile-following-count');
    const vibesCount = document.getElementById('profile-vibes-count');
    if (followersCount) followersCount.textContent = '...';
    if (followingCount) followingCount.textContent = '...';
    if (vibesCount) vibesCount.textContent = '...';

    const vibesGrid = document.getElementById('profile-vibes-grid');
    if (vibesGrid) vibesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px;">Loading hubs... 📸</div>';

    const reelsGrid = document.getElementById('profile-reels-grid');
    if (reelsGrid) reelsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px;">Loading reels... 🎥</div>';

    try {
      const targetId = isMe ? (currentUser.id || currentUser._id) : userId;
      const res = await fetch(`${API_URL}/api/users/${targetId}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load profile');
      const data = await res.json();

      const user = data.user;
      const posts = data.posts;
      const reels = data.reels;

      // Update profile info elements
      const profileAvatar = document.querySelector('.profile-screen-avatar');
      if (profileAvatar) profileAvatar.src = user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80';
      
      const profileName = document.querySelector('.profile-summary-top h3');
      if (profileName) {
        profileName.innerHTML = user.fullName + ' <span class="verified-badge"><i data-lucide="check"></i></span>';
      }
      
      const profileHandle = document.querySelector('.profile-screen-handle');
      if (profileHandle) profileHandle.textContent = '@' + user.username;

      const profileBio = document.getElementById('profile-bio-text');
      if (profileBio) profileBio.textContent = user.bio || '';

      // Update follow statistics
      const followersCount = document.getElementById('profile-followers-count');
      const followingCount = document.getElementById('profile-following-count');
      const vibesCount = document.getElementById('profile-vibes-count');
      if (followersCount) followersCount.textContent = formatCount(user.followersCount);
      if (followingCount) followingCount.textContent = formatCount(user.followingCount);
      if (vibesCount) vibesCount.textContent = posts.length;

      // Toggle buttons depending on if viewing self or other creators
      const followBtn = document.getElementById('profile-follow-btn');
      const optionsList = document.querySelector('.profile-options-list');
      const logoutBtn = document.getElementById('profile-logout-btn');

      if (isMe) {
        if (followBtn) followBtn.style.display = 'none';
        if (optionsList) optionsList.style.display = 'grid';
        if (logoutBtn) logoutBtn.style.display = 'block';
      } else {
        if (followBtn) {
          followBtn.style.display = 'block';
          followBtn.setAttribute('data-user-id', user._id);
          if (user.isFollowing) {
            followBtn.classList.add('followed');
            followBtn.textContent = 'Hubbies';
          } else {
            followBtn.classList.remove('followed');
            followBtn.textContent = 'Follow';
          }
        }
        if (optionsList) optionsList.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
      }

      // Render posts grid (Vibes Gallery)
      const vibesGrid = document.getElementById('profile-vibes-grid');
      if (vibesGrid) {
        vibesGrid.innerHTML = '';
        if (posts.length === 0) {
          vibesGrid.innerHTML = '<div class="profile-grid-empty">No hubs shared yet. 📸</div>';
        } else {
          posts.forEach(post => {
            const item = document.createElement('div');
            item.className = 'profile-grid-item';
            item.style.cursor = 'pointer';
            item.innerHTML = `
              <img src="${post.mediaUrl}" alt="Hub" />
              <div class="profile-grid-item-overlay">
                <span><i data-lucide="heart"></i> ${post.likes.length}</span>
                <span><i data-lucide="message-square"></i> ${post.comments.length}</span>
              </div>
            `;
            item.addEventListener('click', () => {
              openProfilePostViewer(post);
            });
            vibesGrid.appendChild(item);
          });
        }
      }

      // Render reels grid (Reels Gallery)
      const reelsGrid = document.getElementById('profile-reels-grid');
      if (reelsGrid) {
        reelsGrid.innerHTML = '';
        if (reels.length === 0) {
          reelsGrid.innerHTML = '<div class="profile-grid-empty">No reels uploaded yet. 🎥</div>';
        } else {
          reels.forEach(reel => {
            const item = document.createElement('div');
            item.className = 'profile-grid-item';
            item.innerHTML = `
              <video src="${reel.videoUrl}" muted loop></video>
              <div class="profile-grid-item-overlay">
                <span><i data-lucide="heart"></i> ${reel.likes.length}</span>
              </div>
            `;
            const video = item.querySelector('video');
            item.addEventListener('mouseenter', () => video.play());
            item.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
            reelsGrid.appendChild(item);
          });
        }
      }

      debouncedCreateIcons();
    } catch (err) {
      console.error(err);
      showToast('Error loading user profile.');
    }
  }

  // --- PROFILE POST VIEWER MODAL SYSTEM (CHANGE 1) ---
  const profilePostViewerModal = document.getElementById('profile-post-viewer-modal');
  const profilePostViewerCloseBtn = document.getElementById('profile-post-viewer-close-btn');
  const profilePostViewerContent = document.getElementById('profile-post-viewer-content');

  function openProfilePostViewer(post) {
    if (!profilePostViewerModal || !profilePostViewerContent) return;

    const currentUserStr = localStorage.getItem('invibeUser');
    const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
    const isLikedByMe = currentUser ? post.likes.includes(currentUser.id) : false;

    let commentsHTML = '';
    post.comments.forEach(comment => {
      commentsHTML += `
        <div class="comment-item" style="display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px;">
          <img src="${comment.author.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" />
          <div>
            <strong style="color: var(--text-color); margin-right: 4px;">${comment.author.username}</strong>
            <span style="color: var(--text-muted);">${comment.text}</span>
          </div>
        </div>
      `;
    });

    const cardHTML = `
      <article class="feed-card" id="post-${post._id}">
        <div class="post-header">
          <div class="post-author-info">
            <img src="${post.author.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="${post.author.fullName}" class="author-avatar" />
            <div>
              <h4 class="author-name">${post.author.fullName} <span class="verified-badge"><i data-lucide="check"></i></span></h4>
              <div class="post-meta">
                <span class="post-time">${new Date(post.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <span class="dot-separator">•</span>
                <i data-lucide="globe" class="meta-icon"></i>
              </div>
            </div>
          </div>
          <button class="post-options-btn"><i data-lucide="more-horizontal"></i></button>
        </div>

        <div class="post-media-container" style="position:relative; overflow:hidden; border-radius: 12px; margin: 12px 0;">
          ${post.mediaType === 'video'
            ? `<video src="${post.mediaUrl}" loop muted playsinline style="width:100%; border-radius:12px; display:block;" class="post-media-video"></video>
               <div class="video-play-overlay">
                 <button class="play-btn-big"><i data-lucide="play"></i></button>
               </div>`
            : `<img src="${post.mediaUrl}" alt="Post Media" style="width:100%; border-radius:12px; display:block;" />`
          }
          <div class="double-tap-heart"><i data-lucide="heart"></i></div>

          <div class="post-engagement-actions">
            <div class="engagement-item like-btn-action ${isLikedByMe ? 'liked' : ''}" data-post-id="${post._id}">
              <button class="action-circle-btn heart-btn"><i data-lucide="heart" style="${isLikedByMe ? 'fill:#8b5cf6; stroke:#8b5cf6;' : ''}"></i></button>
              <span class="action-count">${post.likes.length}</span>
            </div>
            <div class="engagement-item comment-btn-action" data-post-id="${post._id}">
              <button class="action-circle-btn"><i data-lucide="message-circle"></i></button>
              <span class="action-count">${post.comments.length}</span>
            </div>
            <div class="engagement-item share-btn-action" data-post-id="${post._id}">
              <button class="action-circle-btn"><i data-lucide="send"></i></button>
            </div>
            <div class="engagement-item bookmark-btn-action" data-post-id="${post._id}">
              <button class="action-circle-btn bookmark-btn"><i data-lucide="bookmark"></i></button>
            </div>
          </div>
        </div>

        <div class="post-details">
          <p class="post-caption"><strong class="author-username" style="margin-right: 8px;">${post.author.username}</strong>${post.caption}</p>
          
          <div class="comments-section" style="margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 12px;">
            <div class="comments-list" id="comments-list-${post._id}">
              ${commentsHTML}
            </div>
            
            <div class="post-comment-input-area" style="display: flex; gap: 8px; margin-top: 12px;">
              <input type="text" placeholder="Add a comment..." class="comment-input-field" id="comment-input-${post._id}" style="flex:1; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px; padding: 8px 16px; color: var(--text-color); font-size: 13px;" />
              <button class="send-comment-btn" data-post-id="${post._id}" style="background: var(--primary-color); border:none; color:white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <i data-lucide="send" style="width:14px; height:14px;"></i>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;

    profilePostViewerContent.innerHTML = cardHTML;
    profilePostViewerModal.classList.add('active');

    debouncedCreateIcons();

    // Wire up like button
    const likeBtn = profilePostViewerContent.querySelector('.like-btn-action');
    if (likeBtn) {
      likeBtn.addEventListener('click', async () => {
        const pid = likeBtn.getAttribute('data-post-id');
        await togglePostLike(pid, likeBtn);
      });
    }

    // Wire up bookmark button
    const bookmarkBtn = profilePostViewerContent.querySelector('.bookmark-btn');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', () => {
        bookmarkBtn.classList.toggle('saved');
        const icon = bookmarkBtn.querySelector('i, svg');
        if (bookmarkBtn.classList.contains('saved')) {
          if (icon) { icon.style.fill = '#FBBF24'; icon.style.stroke = '#FBBF24'; }
          showToast('Saved to bookmarks! 🔖');
        } else {
          if (icon) { icon.style.fill = 'none'; icon.style.stroke = 'currentColor'; }
          showToast('Removed from bookmarks');
        }
      });
    }

    // Wire up share button
    const shareBtn = profilePostViewerContent.querySelector('.share-btn-action');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        showToast('Share link copied! 🔗');
      });
    }

    // Wire up comment send button
    const commentSendBtn = profilePostViewerContent.querySelector('.send-comment-btn');
    if (commentSendBtn) {
      commentSendBtn.addEventListener('click', async () => {
        const pid = commentSendBtn.getAttribute('data-post-id');
        const input = document.getElementById(`comment-input-${pid}`);
        const text = input ? input.value.trim() : '';
        if (text) {
          await submitComment(pid, text, input);
        }
      });
    }

    // Wire up comment input enter key
    const commentInput = profilePostViewerContent.querySelector('.comment-input-field');
    if (commentInput) {
      commentInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const pid = commentInput.id.replace('comment-input-', '');
          const text = commentInput.value.trim();
          if (text) {
            await submitComment(pid, text, commentInput);
          }
        }
      });
    }

    // Wire up video play overlay
    const videoOverlay = profilePostViewerContent.querySelector('.video-play-overlay');
    if (videoOverlay) {
      videoOverlay.addEventListener('click', () => {
        const container = videoOverlay.closest('.post-media-container');
        const video = container.querySelector('.post-media-video');
        const playIcon = videoOverlay.querySelector('i');
        if (video.paused) {
          video.play();
          playIcon.setAttribute('data-lucide', 'pause');
          videoOverlay.style.background = 'rgba(0,0,0,0)';
          videoOverlay.style.opacity = '0';
        } else {
          video.pause();
          playIcon.setAttribute('data-lucide', 'play');
          videoOverlay.style.background = 'rgba(0,0,0,0.25)';
          videoOverlay.style.opacity = '1';
        }
        debouncedCreateIcons();
      });
    }

    // Wire up double-tap heart on media
    const mediaContainer = profilePostViewerContent.querySelector('.post-media-container');
    if (mediaContainer) {
      let lastTap = 0;
      mediaContainer.addEventListener('click', async (e) => {
        if (e.target.closest('.post-engagement-actions')) return;
        const now = Date.now();
        const timespan = now - lastTap;
        if (timespan < 300 && timespan > 0) {
          e.preventDefault();
          const btn = mediaContainer.closest('.feed-card').querySelector('.like-btn-action');
          const pid = btn.getAttribute('data-post-id');
          const doubleHeart = mediaContainer.querySelector('.double-tap-heart');
          
          const rect = mediaContainer.getBoundingClientRect();
          const relativeX = e.clientX - rect.left;
          const relativeY = e.clientY - rect.top;

          if (doubleHeart) {
            doubleHeart.style.left = `${relativeX}px`;
            doubleHeart.style.top = `${relativeY}px`;
            doubleHeart.classList.remove('animate');
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                doubleHeart.classList.add('animate');
              });
            });
          }

          if (!btn.classList.contains('liked')) {
            await togglePostLike(pid, btn);
          }
        }
        lastTap = now;
      });
    }
  }

  // Close profile post viewer modal
  if (profilePostViewerCloseBtn && profilePostViewerModal) {
    profilePostViewerCloseBtn.addEventListener('click', () => {
      profilePostViewerModal.classList.remove('active');
      // Pause any playing video
      const video = profilePostViewerContent.querySelector('video');
      if (video) video.pause();
    });
  }
  // Close on overlay background click
  if (profilePostViewerModal) {
    profilePostViewerModal.addEventListener('click', (e) => {
      if (e.target === profilePostViewerModal) {
        profilePostViewerModal.classList.remove('active');
        const video = profilePostViewerContent.querySelector('video');
        if (video) video.pause();
      }
    });
  }

  // Bind profile tabs selection logic
  const profileTabButtons = document.querySelectorAll('.profile-content-tab');
  profileTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      profileTabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabName = btn.getAttribute('data-profile-tab');

      const vibesGrid = document.getElementById('profile-vibes-grid');
      const reelsGrid = document.getElementById('profile-reels-grid');

      if (tabName === 'vibes') {
        if (vibesGrid) vibesGrid.classList.add('active');
        if (reelsGrid) reelsGrid.classList.remove('active');
      } else {
        if (vibesGrid) vibesGrid.classList.remove('active');
        if (reelsGrid) reelsGrid.classList.add('active');
      }
    });
  });

  // Bind follow/unfollow action on user profile
  const profileFollowBtn = document.getElementById('profile-follow-btn');
  if (profileFollowBtn) {
    profileFollowBtn.addEventListener('click', async () => {
      const uid = profileFollowBtn.getAttribute('data-user-id');
      const token = localStorage.getItem('invibe_jwt_token');
      if (!token || !uid) return;

      const isFollowing = profileFollowBtn.classList.contains('followed');
      const endpoint = isFollowing ? 'unfollow' : 'follow';

      try {
        const res = await fetch(`${API_URL}/api/users/${uid}/${endpoint}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (endpoint === 'follow') {
          profileFollowBtn.classList.add('followed');
          profileFollowBtn.textContent = 'Hubbies';
          showToast(data.message || 'Followed successfully!');
        } else {
          profileFollowBtn.classList.remove('followed');
          profileFollowBtn.textContent = 'Follow';
          showToast('Unfollowed successfully.');
        }
        
        loadProfileStats();
        loadFollowSuggestions();
        loadUserProfile(uid);
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  // ─── FOLLOWERS / FOLLOWING RELATIONS MODAL LOGIC ───
  const followersCountEl = document.getElementById('profile-followers-count');
  const followingCountEl = document.getElementById('profile-following-count');
  const relationsModal = document.getElementById('relations-list-modal');
  const relationsCloseBtn = document.getElementById('relations-list-close-btn');
  const relationsTitle = document.getElementById('relations-list-title');
  const relationsContent = document.getElementById('relations-list-content');

  if (relationsCloseBtn && relationsModal) {
    relationsCloseBtn.addEventListener('click', () => {
      relationsModal.classList.remove('active');
    });
  }

  async function openRelationsModal(type) {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;

    const followBtn = document.getElementById('profile-follow-btn');
    const currentUserStr = localStorage.getItem('invibeUser');
    if (!currentUserStr) return;
    const currentUser = JSON.parse(currentUserStr);
    
    const isMe = (followBtn && followBtn.style.display === 'none');
    const targetUserId = isMe ? (currentUser.id || currentUser._id) : followBtn.getAttribute('data-user-id');
    if (!targetUserId) return;

    relationsTitle.textContent = type === 'followers' ? 'HUBBERS' : 'HUBBIES';
    relationsContent.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Loading...</div>';
    relationsModal.setAttribute('data-relation-type', type);
    relationsModal.classList.add('active');

    try {
      const res = await fetch(`${API_URL}/api/users/${targetUserId}/${type}-list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load list');
      const users = await res.json();

      relationsContent.innerHTML = '';
      if (users.length === 0) {
        relationsContent.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">No users found</div>`;
        return;
      }

      users.forEach(user => {
        const row = document.createElement('div');
        row.className = 'search-person-row';
        row.style.margin = '10px 0';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';

        row.innerHTML = `
          <div class="person-info" style="display: flex; align-items: center; cursor: pointer;">
            <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="${user.fullName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px;" />
            <div style="display: flex; flex-direction: column;">
              <strong class="relations-user-name" style="font-size: 14px; color: var(--text-color);">${user.fullName}</strong>
              <span style="font-size: 12px; color: var(--text-muted);">@${user.username}</span>
            </div>
          </div>
          ${user.isMe ? '' : `
            <button class="search-follow-btn relations-follow-btn ${user.isFollowing ? 'followed' : ''}" data-user-id="${user._id}">
              ${user.isFollowing ? 'Hubbies' : 'Follow'}
            </button>
          `}
        `;

        row.querySelector('.person-info').addEventListener('click', () => {
          relationsModal.classList.remove('active');
          switchView('profile', user._id);
        });

        const rFollowBtn = row.querySelector('.relations-follow-btn');
        if (rFollowBtn) {
          rFollowBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uid = rFollowBtn.getAttribute('data-user-id');
            const isFollowing = rFollowBtn.classList.contains('followed');
            const endpoint = isFollowing ? 'unfollow' : 'follow';

            try {
              const res = await fetch(`${API_URL}/api/users/${uid}/${endpoint}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);

              if (endpoint === 'follow') {
                rFollowBtn.classList.add('followed');
                rFollowBtn.textContent = 'Hubbies';
                showToast(data.message || 'Followed successfully!');
              } else {
                rFollowBtn.classList.remove('followed');
                rFollowBtn.textContent = 'Follow';
                showToast('Unfollowed successfully.');
              }
              
              loadProfileStats();
              loadUserProfile(targetUserId);
            } catch (err) {
              showToast(err.message);
            }
          });
        }

        relationsContent.appendChild(row);
      });

      debouncedCreateIcons();
    } catch (err) {
      console.error(err);
      relationsContent.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--error-color);">Error loading data</div>';
    }
  }

  if (followersCountEl) {
    followersCountEl.parentElement.style.cursor = 'pointer';
    followersCountEl.parentElement.addEventListener('click', () => openRelationsModal('followers'));
  }
  if (followingCountEl) {
    followingCountEl.parentElement.style.cursor = 'pointer';
    followingCountEl.parentElement.addEventListener('click', () => openRelationsModal('following'));
  }

  // --- GLOBAL USER SEARCH LOGIC ---
  const globalSearchInput = document.getElementById('global-search');
  const searchDropdown = document.getElementById('search-results-dropdown');
  const searchList = document.getElementById('search-results-list');

  if (globalSearchInput && searchDropdown && searchList) {
    let searchDebounceTimeout;

    globalSearchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimeout);
      const query = globalSearchInput.value.trim();

      if (!query) {
        searchDropdown.style.display = 'none';
        searchList.innerHTML = '';
        return;
      }

      searchDebounceTimeout = setTimeout(async () => {
        const token = localStorage.getItem('invibe_jwt_token');
        if (!token) return;

        try {
          const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Search failed');
          const users = await res.json();

          searchList.innerHTML = '';
          if (users.length === 0) {
            searchList.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">No users found</div>';
            searchDropdown.style.display = 'block';
            return;
          }

          users.forEach(user => {
            const row = document.createElement('div');
            row.className = 'search-result-row';
            row.innerHTML = `
              <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}" alt="${user.fullName}" class="search-result-avatar" />
              <div class="search-result-info">
                <h5>${user.fullName}</h5>
                <p>@${user.username}</p>
              </div>
              <button class="search-follow-btn ${user.isFollowing ? 'followed' : ''}" data-user-id="${user._id}">
                ${user.isFollowing ? 'Hubbies' : 'Follow'}
              </button>
            `;

            // Row click triggers profile navigation
            row.addEventListener('click', (e) => {
              if (e.target.closest('.search-follow-btn')) return;
              
              switchView('profile', user._id);
              
              globalSearchInput.value = '';
              searchDropdown.style.display = 'none';
            });

            searchList.appendChild(row);
          });

          // Wire search result follow buttons
          const followBtns = searchList.querySelectorAll('.search-follow-btn');
          followBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const uid = btn.getAttribute('data-user-id');
              const isFollowing = btn.classList.contains('followed');
              const endpoint = isFollowing ? 'unfollow' : 'follow';

              try {
                const res = await fetch(`${API_URL}/api/users/${uid}/${endpoint}`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                if (endpoint === 'follow') {
                  btn.classList.add('followed');
                  btn.textContent = 'Hubbies';
                  showToast(data.message || 'Followed successfully!');
                } else {
                  btn.classList.remove('followed');
                  btn.textContent = 'Follow';
                  showToast('Unfollowed successfully.');
                }
                loadProfileStats();
                loadFollowSuggestions();
              } catch (err) {
                showToast(err.message);
              }
            });
          });

          searchDropdown.style.display = 'block';
        } catch (err) {
          console.error(err);
        }
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if (!globalSearchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.style.display = 'none';
      }
    });
  }

  // Dedicated search tab input event listener
  const searchViewInput = document.getElementById('search-view-input');
  if (searchViewInput) {
    let searchViewDebounce;
    searchViewInput.addEventListener('input', () => {
      clearTimeout(searchViewDebounce);
      const query = searchViewInput.value.trim();

      const searchGrid = document.querySelector('.search-view .search-grid');
      let resultsContainer = document.getElementById('search-view-results');
      if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'search-view-results';
        resultsContainer.className = 'search-person-list';
        resultsContainer.style.marginTop = '20px';
        searchViewInput.closest('.search-view').appendChild(resultsContainer);
      }

      if (!query) {
        if (searchGrid) searchGrid.style.display = 'grid';
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        return;
      }

      searchViewDebounce = setTimeout(async () => {
        const token = localStorage.getItem('invibe_jwt_token');
        if (!token) return;

        try {
          const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Search failed');
          const users = await res.json();

          if (searchGrid) searchGrid.style.display = 'none';
          resultsContainer.style.display = 'block';
          resultsContainer.innerHTML = '';

          if (users.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No users found matching your search.</div>';
            return;
          }

          users.forEach(user => {
            const row = document.createElement('div');
            row.className = 'search-person-row';
            row.style.margin = '12px 0';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.background = 'rgba(255, 255, 255, 0.03)';
            row.style.padding = '12px';
            row.style.borderRadius = 'var(--radius-lg)';
            row.style.border = '1px solid rgba(255, 255, 255, 0.05)';

            row.innerHTML = `
              <div class="person-info" style="display: flex; align-items: center; cursor: pointer; flex-grow: 1;">
                <img src="${user.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80'}" alt="${user.fullName}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; margin-right: 12px;" />
                <div style="display: flex; flex-direction: column;">
                  <strong style="font-size: 14px; color: var(--text-color);">${user.fullName}</strong>
                  <span style="font-size: 12px; color: var(--text-muted);">@${user.username}</span>
                </div>
              </div>
              <button class="search-follow-btn ${user.isFollowing ? 'followed' : ''}" data-user-id="${user._id}">
                ${user.isFollowing ? 'Hubbies' : 'Follow'}
              </button>
            `;

            // Row click triggers profile navigation
            row.querySelector('.person-info').addEventListener('click', () => {
              switchView('profile', user._id);
              searchViewInput.value = '';
              if (searchGrid) searchGrid.style.display = 'grid';
              resultsContainer.style.display = 'none';
            });

            // Follow button listener
            const followBtn = row.querySelector('.search-follow-btn');
            if (followBtn) {
              followBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const uid = followBtn.getAttribute('data-user-id');
                const isFollowing = followBtn.classList.contains('followed');
                const endpoint = isFollowing ? 'unfollow' : 'follow';

                try {
                  const res = await fetch(`${API_URL}/api/users/${uid}/${endpoint}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);

                  if (endpoint === 'follow') {
                    followBtn.classList.add('followed');
                    followBtn.textContent = 'Hubbies';
                    showToast(data.message || 'Followed successfully!');
                  } else {
                    followBtn.classList.remove('followed');
                    followBtn.textContent = 'Follow';
                    showToast('Unfollowed successfully.');
                  }
                  loadProfileStats();
                } catch (err) {
                  showToast(err.message);
                }
              });
            }

            resultsContainer.appendChild(row);
          });
        } catch (err) {
          console.error(err);
          showToast('Search query failed.');
        }
      }, 300);
    });
  }

  // Run database sync loaders
  loadFeedPosts();
  loadFeedReels();
  loadFollowSuggestions();
  loadProfileStats();
  loadStories();
  loadActiveVibers();
  
  // Custom auth reload hook
  window.updateAppUI = function() {
    const userStr = localStorage.getItem('invibeUser');
    const profileImage = localStorage.getItem('invibeProfileImage');
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr);
      const headerAvatar = document.querySelector('#header-profile-avatar img');
      if (headerAvatar && profileImage) headerAvatar.src = profileImage;
      const sidebarAvatar = document.querySelector('.profile-preview-avatar img');
      if (sidebarAvatar && profileImage) sidebarAvatar.src = profileImage;
      const createPostAvatar = document.querySelector('#create-post-user-avatar');
      if (createPostAvatar && profileImage) createPostAvatar.src = profileImage;
      const sidebarName = document.querySelector('.profile-preview-info h3');
      if (sidebarName && user.fullName) sidebarName.textContent = user.fullName;
      const sidebarUsername = document.querySelector('.profile-preview-info p');
      if (sidebarUsername && user.username) sidebarUsername.textContent = '@' + user.username;
      const storyAvatar = document.querySelector('.story-card.current-user .story-avatar-container img');
      if (storyAvatar && profileImage) storyAvatar.src = profileImage;
      const myProfileAvatar = document.querySelector('.profile-screen-avatar');
      if (myProfileAvatar && profileImage) myProfileAvatar.src = profileImage;
      const myProfileName = document.querySelector('.profile-summary-top h3');
      if (myProfileName && user.fullName) {
        myProfileName.innerHTML = user.fullName + ' <span class="verified-badge"><i data-lucide="check"></i></span>';
        debouncedCreateIcons();
      }
      const myProfileUsername = document.querySelector('.profile-screen-handle');
      if (myProfileUsername && user.username) myProfileUsername.textContent = '@' + user.username;
      
      const bannerImage = localStorage.getItem('invibeBannerImage');
      const sidebarBanner = document.querySelector('.sidebar-left .card-cover-bg');
      if (sidebarBanner && bannerImage) {
        sidebarBanner.style.backgroundImage = `url(${bannerImage})`;
        sidebarBanner.style.backgroundSize = 'cover';
        sidebarBanner.style.backgroundPosition = 'center';
      }
      
      loadProfileStats();
      loadFollowSuggestions();
      loadStories();
      loadActiveVibers();
      loadNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  // ─── NOTIFICATIONS DROPDOWN AND BADGES INTERACTION SYSTEM ────────────────────
  const notifBtn = document.getElementById('notif-btn');
  const notifPanel = document.getElementById('notifications-panel');
  const notifBadge = document.getElementById('header-notif-badge');
  const radialNotifBadge = document.getElementById('radial-notif-badge');

  async function loadNotifications() {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) {
      if (notifBadge) notifBadge.style.display = 'none';
      if (radialNotifBadge) radialNotifBadge.style.display = 'none';
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const notifications = await res.json();
      
      // Update badges (blue diamond for unread notifications)
      const unreadCount = notifications.filter(n => !n.read).length;
      if (unreadCount > 0) {
        if (notifBadge) {
          notifBadge.className = 'badge blue-diamond';
          notifBadge.style.display = 'block';
        }
        if (radialNotifBadge) {
          radialNotifBadge.className = 'nav-icon-badge blue-diamond';
          radialNotifBadge.style.display = 'flex';
          radialNotifBadge.textContent = '';
        }
      } else {
        if (notifBadge) {
          notifBadge.className = 'badge';
          notifBadge.style.display = 'none';
        }
        if (radialNotifBadge) {
          radialNotifBadge.className = 'nav-icon-badge';
          radialNotifBadge.style.display = 'none';
        }
      }

      // Render notification items in panel
      renderNotificationsPanel(notifications);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }

  function renderNotificationsPanel(notifications) {
    if (!notifPanel) return;

    const listContainer = notifPanel.querySelector('.notifications-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (notifications.length === 0) {
      listContainer.innerHTML = `
        <div class="notification-empty">
          <i data-lucide="bell-off"></i>
          <p>No notifications yet</p>
        </div>
      `;
      debouncedCreateIcons();
      return;
    }

    notifications.forEach(notif => {
      const item = document.createElement('div');
      item.className = `notification-item ${notif.read ? '' : 'unread'}`;
      
      const sender = notif.sender || { fullName: 'Someone', username: 'someone', profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80' };
      const senderAvatar = sender.profileImage || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80';
      
      let messageText = '';
      let mediaThumbnail = '';

      if (notif.type === 'follow') {
        messageText = `<strong>@${sender.username}</strong> started following you.`;
      } else if (notif.type === 'like_post') {
        messageText = `<strong>@${sender.username}</strong> liked your post.`;
        if (notif.post && notif.post.mediaUrl) {
          mediaThumbnail = `<img src="${notif.post.mediaUrl}" class="notification-media" alt="Post thumbnail"/>`;
        }
      } else if (notif.type === 'like_reel') {
        messageText = `<strong>@${sender.username}</strong> liked your reel.`;
        if (notif.reel && notif.reel.videoUrl) {
          mediaThumbnail = `
            <div style="position: relative; width: 36px; height: 36px;">
              <video src="${notif.reel.videoUrl}" class="notification-media" style="object-fit: cover; width:36px; height:36px;" muted></video>
              <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); border-radius: var(--radius-sm);">
                <i data-lucide="play" style="width: 10px; height: 10px; stroke: white; fill: white;"></i>
              </div>
            </div>`;
        }
      } else if (notif.type === 'like_story') {
        messageText = `❤️ <strong>@${sender.username}</strong> liked your Hub.`;
        if (notif.story && notif.story.mediaUrl) {
          mediaThumbnail = `<img src="${notif.story.mediaUrl}" class="notification-media" alt="Hub thumbnail"/>`;
        }
      }

      const timeAgo = formatTimeAgo(new Date(notif.createdAt));

      item.innerHTML = `
        <img src="${senderAvatar}" class="notification-avatar" alt="${sender.username}"/>
        <div class="notification-content">
          <p>${messageText}</p>
          <span class="notification-time">${timeAgo}</span>
        </div>
        ${mediaThumbnail}
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (sender._id) {
          switchView('profile', sender._id);
          notifPanel.style.display = 'none';
        }
      });

      listContainer.appendChild(item);
    });

    debouncedCreateIcons();
  }

  function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Setup click handler for toggle panel
  if (notifBtn && notifPanel) {
    notifBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      const searchDropdown = document.getElementById('search-results-dropdown');
      if (searchDropdown) searchDropdown.style.display = 'none';

      const isVisible = notifPanel.style.display === 'flex';
      if (isVisible) {
        notifPanel.style.display = 'none';
      } else {
        notifPanel.style.display = 'flex';
        // Auto mark as read on open
        const token = localStorage.getItem('invibe_jwt_token');
        if (token) {
          try {
            await fetch(`${API_URL}/api/notifications/read`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            await loadNotifications();
          } catch (err) {
            console.error('Error marking read:', err);
          }
        }
      }
    });
  }

  // Mobile navigation bubble redirection to header button click
  const radialNotifBtn = document.getElementById('nav-notifications-btn');
  if (radialNotifBtn) {
    radialNotifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (notifBtn) notifBtn.click();
    });
  }

  // Manual mark all read button inside panel
  const markReadBtn = notifPanel ? notifPanel.querySelector('.mark-read-btn') : null;
  if (markReadBtn) {
    markReadBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const token = localStorage.getItem('invibe_jwt_token');
      if (!token) return;
      try {
        await fetch(`${API_URL}/api/notifications/read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        await loadNotifications();
      } catch (err) {
        console.error('Error marking read:', err);
      }
    });
  }

  // Click outside to close panel
  document.addEventListener('click', (e) => {
    if (notifPanel && notifPanel.style.display === 'flex') {
      if (!notifPanel.contains(e.target) && (!notifBtn || !notifBtn.contains(e.target))) {
        notifPanel.style.display = 'none';
      }
    }
  });

  // Listen to auth load/changes
  window.addEventListener('auth-changed', () => {
    loadNotifications();
    loadChatThreads();
    loadProfileStats();
    loadFollowSuggestions();
  });

  // Initial load
  loadNotifications();
  loadChatThreads();

  // Polling for incoming calls every 2 seconds
  setInterval(() => {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;
    checkForIncomingCall();
  }, 2000);

  // Polling interval (every 4 seconds for real-world updates)
  setInterval(() => {
    const token = localStorage.getItem('invibe_jwt_token');
    if (!token) return;
    
    loadNotifications();
    loadChatThreads();
    if (state.activeView === 'chats' && state.currentChatThread) {
      fetchMessages(state.currentChatThread, false);
      
      const activeThreadObj = chatThreads.find(t => t.user && t.user._id.toString() === state.currentChatThread.toString());
      if (activeThreadObj && activeThreadObj.user) {
        const u = activeThreadObj.user;
        const isOnline = (new Date() - new Date(u.lastActive)) < 120000;
        const statusHtml = isOnline 
          ? `<span class="online-indicator blue-diamond-status" style="position:static; display:inline-block; margin-right:4px; width:8px; height:8px;"></span> Online`
          : `<span class="online-indicator black-diamond-status" style="position:static; display:inline-block; margin-right:4px; width:8px; height:8px;"></span> Offline`;
        const headerStatus = document.querySelector('.chat-header-status');
        if (headerStatus) headerStatus.innerHTML = statusHtml;
      }
    }
  }, 4000);

});
