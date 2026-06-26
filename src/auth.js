export function initAuth() {
  const authView = document.getElementById('auth-view');
  const appContainer = document.getElementById('app-container');
  const authForm = document.getElementById('auth-form');
  const dobInput = document.getElementById('auth-dob');
  const ageCheckbox = document.getElementById('age-checkbox');
  const ageWarning = document.getElementById('age-warning');
  const createAccountBtn = document.getElementById('create-account-btn');
  const profileUploadModal = document.getElementById('profile-upload-modal');

  // Welcome page elements
  const authWelcomePanel = document.getElementById('auth-welcome-panel');
  const authGlassContainer = document.getElementById('auth-glass-container');
  const welcomeSigninBtn = document.getElementById('welcome-signin-btn');
  const welcomeSignupBtn = document.getElementById('welcome-signup-btn');
  const authBackBtn = document.getElementById('auth-back-btn');

  // OTP elements
  const otpModal = document.getElementById('otp-verification-modal');
  const otpInputs = document.querySelectorAll('.otp-input');
  const verifyOtpBtn = document.getElementById('verify-otp-btn');
  const resendOtpLink = document.getElementById('resend-otp-link');
  const otpTimer = document.getElementById('otp-timer');
  const otpErrorMsg = document.getElementById('otp-error-msg');

  const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin;
  let tempUserData = null;
  let pendingVerificationEmail = null;
  let isSignUpVerification = false;
  let isForgotVerification = false;
  let tempNewPassword = null;

  // Focus transition logic for 6-digit OTP code inputs
  if (otpInputs.length > 0) {
    otpInputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        input.value = input.value.replace(/[^0-9]/g, '');
        if (input.value && idx < otpInputs.length - 1) {
          otpInputs[idx + 1].focus();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          otpInputs[idx - 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').trim();
        if (/^\d{6}$/.test(pastedData)) {
          pastedData.split('').forEach((char, i) => {
            if (otpInputs[i]) otpInputs[i].value = char;
          });
          otpInputs[5].focus();
        }
      });
    });
  }

  let resendTimerInterval = null;
  let countdown = 30;

  function startResendTimer() {
    if (resendOtpLink) resendOtpLink.classList.add('disabled');
    countdown = 30;
    if (otpTimer) otpTimer.textContent = countdown;
    
    if (resendTimerInterval) clearInterval(resendTimerInterval);
    resendTimerInterval = setInterval(() => {
      countdown--;
      if (otpTimer) otpTimer.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(resendTimerInterval);
        if (resendOtpLink) {
          resendOtpLink.classList.remove('disabled');
          resendOtpLink.innerHTML = 'Resend Code';
        }
      }
    }, 1000);
  }

  async function sendOTPEmail(email) {
    try {
      const res = await fetch(`${API_URL}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.devFallbackOtp) {
          if (otpErrorMsg) {
            otpErrorMsg.innerHTML = `<span style="color: #eab308">⚠️ SMTP Error: ${data.details || 'Auth failed'}.</span><br><span style="color: #22c55e">Dev Mode OTP: ${data.devFallbackOtp}</span>`;
          }
          return true;
        }
        throw new Error(data.error || 'Failed to send verification code');
      }
      return true;
    } catch (err) {
      console.error(err);
      if (otpErrorMsg) otpErrorMsg.textContent = err.message;
      return false;
    }
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      const code = Array.from(otpInputs).map(input => input.value).join('');
      if (code.length < 6) {
        if (otpErrorMsg) otpErrorMsg.textContent = "Please enter the complete 6-digit code.";
        return;
      }

      if (otpErrorMsg) otpErrorMsg.textContent = "Verifying...";

      try {
        const res = await fetch(`${API_URL}/api/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingVerificationEmail, otp: code })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Verification failed. Invalid code.");
        }

        // Verification Succeeded!
        if (otpModal) otpModal.classList.remove('active');
        
        if (isSignUpVerification) {
          localStorage.setItem('invibeUser', JSON.stringify(tempUserData));
          // Register user on server so it can be accessed from other devices
          try {
            fetch(`${API_URL}/api/register-user`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: tempUserData.username, userData: tempUserData })
            }).catch(err => console.error('Failed to sync user to server:', err));
          } catch (err) {
            console.error('Failed to sync user to server:', err);
          }
          if (profileUploadModal) {
            profileUploadModal.classList.add('active');
            if (window.startLiveCamera) window.startLiveCamera();
          }
        } else if (isForgotVerification) {
          let userStr = localStorage.getItem('invibeUser');
          if (userStr) {
            const user = JSON.parse(userStr);
            user.password = tempNewPassword;
            localStorage.setItem('invibeUser', JSON.stringify(user));
            // Sync password update to server
            try {
              fetch(`${API_URL}/api/register-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user.username, userData: user })
              }).catch(err => console.error('Failed to sync password to server:', err));
            } catch (err) {
              console.error('Failed to sync password to server:', err);
            }
          }
          localStorage.setItem('invibeIsLoggedIn', 'true');
          if (authView) authView.classList.add('hidden');
          setTimeout(() => {
            if (authView) authView.style.display = 'none';
            if (appContainer) appContainer.style.display = 'block';
            updateAppUI();
          }, 500);
        } else {
          localStorage.setItem('invibeIsLoggedIn', 'true');
          if (authView) authView.classList.add('hidden');
          setTimeout(() => {
            if (authView) authView.style.display = 'none';
            if (appContainer) appContainer.style.display = 'block';
            updateAppUI();
          }, 500);
        }
      } catch (err) {
        console.error(err);
        if (otpErrorMsg) otpErrorMsg.textContent = err.message;
      }
    });
  }

  if (resendOtpLink) {
    resendOtpLink.addEventListener('click', async (e) => {
      e.preventDefault();
      if (resendOtpLink.classList.contains('disabled')) return;
      
      if (otpErrorMsg) otpErrorMsg.textContent = "Sending new code...";
      const sent = await sendOTPEmail(pendingVerificationEmail);
      if (sent) {
        if (otpErrorMsg) otpErrorMsg.textContent = "New verification code sent!";
        startResendTimer();
      }
    });
  }

  // Check login state
  const isLoggedIn = localStorage.getItem('invibeIsLoggedIn') === 'true';
  if (isLoggedIn) {
    if (authView) authView.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    updateAppUI();
    return;
  }

  if (authView) authView.style.display = 'flex';
  if (appContainer) appContainer.style.display = 'none';

  // Show welcome page by default, hide form panel
  if (authWelcomePanel) {
    authWelcomePanel.style.display = 'flex';
    authWelcomePanel.classList.remove('hidden');
  }
  if (authGlassContainer) {
    authGlassContainer.classList.add('hidden-container');
  }

  // Reflow Lucide icons inside dynamic panels
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Transitions
  function showWelcome() {
    if (authGlassContainer) {
      authGlassContainer.classList.add('hidden-container');
    }
    setTimeout(() => {
      if (authWelcomePanel) {
        authWelcomePanel.style.display = 'flex';
        // Force reflow
        authWelcomePanel.offsetHeight;
        authWelcomePanel.classList.remove('hidden');
      }
    }, 350);
  }

  function showAuthForm(mode) {
    if (authWelcomePanel) {
      authWelcomePanel.classList.add('hidden');
    }
    setTimeout(() => {
      if (authWelcomePanel) authWelcomePanel.style.display = 'none';
      if (authGlassContainer) {
        authGlassContainer.style.display = 'flex';
        // Force reflow
        authGlassContainer.offsetHeight;
        authGlassContainer.classList.remove('hidden-container');
      }
      
      if (mode === 'signin') {
        setSignInMode();
      } else {
        setSignUpMode();
      }
    }, 350);
  }

  if (welcomeSigninBtn) {
    welcomeSigninBtn.addEventListener('click', () => showAuthForm('signin'));
  }

  if (welcomeSignupBtn) {
    welcomeSignupBtn.addEventListener('click', () => showAuthForm('signup'));
  }

  if (authBackBtn) {
    authBackBtn.addEventListener('click', showWelcome);
  }

  // Logout Logic
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('invibeIsLoggedIn');
      if (appContainer) appContainer.style.display = 'none';
      if (authView) {
        authView.classList.remove('hidden');
        authView.style.display = 'flex';
      }
      // Reset views back to Welcome panel
      if (authGlassContainer) {
        authGlassContainer.classList.add('hidden-container');
      }
      if (authWelcomePanel) {
        authWelcomePanel.style.display = 'flex';
        authWelcomePanel.classList.remove('hidden');
      }
    });
  }

  // Toggle Sign In / Sign Up / Forgot Password Mode
  let currentMode = 'signup'; // 'signup', 'signin', 'forgot'

  function handleAgeValidation() {
    if (currentMode !== 'signup') return;
    if (!dobInput || !dobInput.value) {
      if (createAccountBtn) createAccountBtn.disabled = true;
      if (ageCheckbox) ageCheckbox.classList.remove('checked');
      return;
    }
    const dob = new Date(dobInput.value);
    if (isNaN(dob.getTime())) {
      if (createAccountBtn) createAccountBtn.disabled = true;
      if (ageCheckbox) ageCheckbox.classList.remove('checked');
      return;
    }
    
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    if (age >= 18) {
      if (ageCheckbox) ageCheckbox.classList.add('checked');
      if (ageWarning) ageWarning.style.display = 'none';
      if (createAccountBtn) createAccountBtn.disabled = false;
    } else {
      if (ageCheckbox) ageCheckbox.classList.remove('checked');
      if (ageWarning) ageWarning.style.display = 'block';
      if (createAccountBtn) createAccountBtn.disabled = true;
    }
  }

  // Age Validation Logic
  if (dobInput) {
    dobInput.addEventListener('change', handleAgeValidation);
    dobInput.addEventListener('input', handleAgeValidation);
    dobInput.addEventListener('blur', handleAgeValidation);
  }
  const toggleBtn = document.getElementById('auth-toggle-btn');
  const toggleText = document.getElementById('auth-toggle-text');
  const title = document.getElementById('auth-form-title');
  const signupElements = document.querySelectorAll('.signup-only');
  const signinElements = document.querySelectorAll('.signin-only');
  const forgotElements = document.querySelectorAll('.forgot-only');
  const forgotBtn = document.getElementById('auth-forgot-btn');

  function setSignInMode() {
    currentMode = 'signin';
    
    // Hide signup elements
    signupElements.forEach(el => {
      el.style.display = 'none';
      const inputs = el.querySelectorAll('input');
      inputs.forEach(input => input.removeAttribute('required'));
    });
    
    // Show signin elements
    signinElements.forEach(el => {
      el.style.display = '';
    });
    
    // Hide forgot password elements
    forgotElements.forEach(el => {
      el.style.display = 'none';
      const inputs = el.querySelectorAll('input');
      inputs.forEach(input => input.removeAttribute('required'));
    });
    
    // Configure input requirements & layout for Username, Email, Password
    const emailInput = document.getElementById('auth-email');
    if (emailInput) {
      const parent = emailInput.closest('.input-group');
      if (parent) parent.style.display = 'none';
      emailInput.removeAttribute('required');
    }
    
    const usernameInput = document.getElementById('auth-username');
    if (usernameInput) {
      const parent = usernameInput.closest('.input-group');
      if (parent) parent.style.display = '';
      usernameInput.setAttribute('required', 'true');
    }

    const passwordInput = document.getElementById('auth-password');
    if (passwordInput) {
      passwordInput.placeholder = "Password";
    }

    title.textContent = "Sign in to your account.";
    createAccountBtn.textContent = "Sign In";
    createAccountBtn.disabled = false;
    toggleText.textContent = "Don't have an account?";
    toggleBtn.textContent = "Sign Up";
  }

  function setSignUpMode() {
    currentMode = 'signup';
    
    // Show signup elements
    signupElements.forEach(el => {
      el.style.display = '';
      const inputs = el.querySelectorAll('input');
      inputs.forEach(input => input.setAttribute('required', 'true'));
    });
    
    // Hide signin elements
    signinElements.forEach(el => {
      el.style.display = 'none';
    });
    
    // Hide forgot password elements
    forgotElements.forEach(el => {
      el.style.display = 'none';
      const inputs = el.querySelectorAll('input');
      inputs.forEach(input => input.removeAttribute('required'));
    });

    // Configure input requirements & layout for Username, Email, Password
    const emailInput = document.getElementById('auth-email');
    if (emailInput) {
      const parent = emailInput.closest('.input-group');
      if (parent) parent.style.display = '';
      emailInput.setAttribute('required', 'true');
    }
    
    const usernameInput = document.getElementById('auth-username');
    if (usernameInput) {
      const parent = usernameInput.closest('.input-group');
      if (parent) parent.style.display = '';
      usernameInput.setAttribute('required', 'true');
    }

    const passwordInput = document.getElementById('auth-password');
    if (passwordInput) {
      passwordInput.placeholder = "Password";
    }

    title.textContent = "Create your account.";
    createAccountBtn.textContent = "Create Account";
    
    // Recalculate create account button disabled state based on DOB/Age
    handleAgeValidation();
    
    toggleText.textContent = "Already have an account?";
    toggleBtn.textContent = "Sign In";
  }

  function setForgotMode() {
    currentMode = 'forgot';
    
    // Hide signup elements
    signupElements.forEach(el => {
      el.style.display = 'none';
      const inputs = el.querySelectorAll('input');
      inputs.forEach(input => input.removeAttribute('required'));
    });
    
    // Hide signin elements
    signinElements.forEach(el => {
      el.style.display = 'none';
    });
    
    // Show forgot password elements
    forgotElements.forEach(el => {
      el.style.display = '';
      const inputs = el.querySelectorAll('input');
      inputs.forEach(input => input.setAttribute('required', 'true'));
    });

    // Configure input requirements & layout for Username, Email, Password
    const emailInput = document.getElementById('auth-email');
    if (emailInput) {
      const parent = emailInput.closest('.input-group');
      if (parent) parent.style.display = 'none';
      emailInput.removeAttribute('required');
    }
    
    const usernameInput = document.getElementById('auth-username');
    if (usernameInput) {
      const parent = usernameInput.closest('.input-group');
      if (parent) parent.style.display = '';
      usernameInput.setAttribute('required', 'true');
    }

    const passwordInput = document.getElementById('auth-password');
    if (passwordInput) {
      passwordInput.placeholder = "New Password";
    }

    title.textContent = "Reset your password.";
    createAccountBtn.textContent = "Reset Password";
    createAccountBtn.disabled = false;
    toggleText.textContent = "Remember your password?";
    toggleBtn.textContent = "Sign In";
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentMode === 'signup' || currentMode === 'forgot') {
        setSignInMode();
      } else {
        setSignUpMode();
      }
    });
  }

  if (forgotBtn) {
    forgotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setForgotMode();
    });
  }

  // Form Submission
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (currentMode === 'signin') {
        // Sign in flow: trigger OTP 2FA verification
        const usernameVal = document.getElementById('auth-username').value;
        const passwordVal = document.getElementById('auth-password').value;
        
        let user = null;
        let userStr = localStorage.getItem('invibeUser');
        if (userStr) {
          const localUser = JSON.parse(userStr);
          if (localUser.username && localUser.username.toLowerCase() === usernameVal.toLowerCase()) {
            user = localUser;
          }
        }
        
        // If not found locally, fetch from backend in-memory DB
        if (!user) {
          try {
            const res = await fetch(`${API_URL}/api/get-user/${encodeURIComponent(usernameVal)}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.success && data.userData) {
                user = data.userData;
                localStorage.setItem('invibeUser', JSON.stringify(user));
              }
            }
          } catch (err) {
            console.error('Failed to retrieve user from server:', err);
          }
        }
        
        if (!user) {
          // Create dummy user if none exists (fallback behavior)
          user = {
            fullName: 'Hi-Hubble User',
            email: 'ansoceanversetechnologies@gmail.com',
            username: usernameVal || 'hihubble',
            dob: '1990-01-01',
            age: 30,
            password: passwordVal
          };
          localStorage.setItem('invibeUser', JSON.stringify(user));
        }

        // Validate password
        if (user.password && user.password !== passwordVal) {
          alert("Incorrect password. Please try again.");
          return;
        }

        pendingVerificationEmail = user.email || 'ansoceanversetechnologies@gmail.com';
        isSignUpVerification = false;
        isForgotVerification = false;

        if (otpErrorMsg) otpErrorMsg.textContent = '';
        otpInputs.forEach(input => input.value = '');

        createAccountBtn.disabled = true;
        createAccountBtn.textContent = "Sending OTP...";

        const sent = await sendOTPEmail(pendingVerificationEmail);
        createAccountBtn.disabled = false;
        createAccountBtn.textContent = "Sign In";

        if (sent) {
          startResendTimer();
          if (otpModal) otpModal.classList.add('active');
        }
      } else if (currentMode === 'forgot') {
        // Forgot password flow
        const usernameVal = document.getElementById('auth-username').value.trim();
        const passwordVal = document.getElementById('auth-password').value;
        const confirmPasswordVal = document.getElementById('auth-confirm-password').value;

        if (passwordVal !== confirmPasswordVal) {
          alert("Passwords do not match. Please verify.");
          return;
        }

        let user = null;
        let userStr = localStorage.getItem('invibeUser');
        if (userStr) {
          const localUser = JSON.parse(userStr);
          if (localUser.username && localUser.username.toLowerCase() === usernameVal.toLowerCase()) {
            user = localUser;
          }
        }

        // If not found locally, fetch from backend in-memory DB
        if (!user) {
          try {
            const res = await fetch(`${API_URL}/api/get-user/${encodeURIComponent(usernameVal)}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.success && data.userData) {
                user = data.userData;
                localStorage.setItem('invibeUser', JSON.stringify(user));
              }
            }
          } catch (err) {
            console.error('Failed to retrieve user from server:', err);
          }
        }

        if (!user) {
          // Create dummy user with this username (fallback behavior)
          user = {
            fullName: 'Hi-Hubble User',
            email: 'ansoceanversetechnologies@gmail.com',
            username: usernameVal || 'hihubble',
            dob: '1990-01-01',
            age: 30,
            password: 'password'
          };
          localStorage.setItem('invibeUser', JSON.stringify(user));
        }

        if (user.username.toLowerCase() !== usernameVal.toLowerCase()) {
          alert("This username is not registered.");
          return;
        }

        pendingVerificationEmail = user.email || 'ansoceanversetechnologies@gmail.com';
        isSignUpVerification = false;
        isForgotVerification = true;
        tempNewPassword = passwordVal;

        if (otpErrorMsg) otpErrorMsg.textContent = '';
        otpInputs.forEach(input => input.value = '');

        createAccountBtn.disabled = true;
        createAccountBtn.textContent = "Sending OTP...";

        const sent = await sendOTPEmail(pendingVerificationEmail);
        createAccountBtn.disabled = false;
        createAccountBtn.textContent = "Reset Password";

        if (sent) {
          startResendTimer();
          if (otpModal) otpModal.classList.add('active');
        }
      } else {
        // Sign up flow
        const fullName = document.getElementById('auth-fullname').value;
        const email = document.getElementById('auth-email').value;
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const dob = document.getElementById('auth-dob').value;
        
        const today = new Date();
        const dobDate = new Date(dob);
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;

        tempUserData = {
          fullName,
          email,
          username,
          password,
          dob,
          age
        };
        
        pendingVerificationEmail = email;
        isSignUpVerification = true;
        isForgotVerification = false;

        if (otpErrorMsg) otpErrorMsg.textContent = '';
        otpInputs.forEach(input => input.value = '');

        createAccountBtn.disabled = true;
        createAccountBtn.textContent = "Sending OTP...";

        const sent = await sendOTPEmail(email);
        createAccountBtn.disabled = false;
        createAccountBtn.textContent = "Create Account";

        if (sent) {
          startResendTimer();
          if (otpModal) otpModal.classList.add('active');
        }
      }
    });
  }

  // Profile Upload Logic
  initProfileUpload();
}

function initProfileUpload() {
  const modal = document.getElementById('profile-upload-modal');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const captureBtn = document.getElementById('capture-photo-btn');
  
  const previewContainer = document.getElementById('profile-preview-container');
  const previewImg = document.getElementById('profile-preview-img');
  const removeImgBtn = document.getElementById('remove-profile-img');
  const finishBtn = document.getElementById('finish-profile-btn');

  // Scanning guides
  const faceGuide = document.querySelector('.camera-face-guide');
  const scannerLine = document.querySelector('.camera-scanner-line');
  const scanningGrid = document.querySelector('.camera-scanning-grid');
  const livenessText = document.querySelector('.liveness-status-text');

  let stream = null;

  // Function to start camera
  async function startLiveCamera() {
    try {
      if (livenessText) livenessText.textContent = "INITIALIZING CAMERA...";
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: 'user' 
        } 
      });
      if (cameraVideo) {
        cameraVideo.srcObject = stream;
        if (livenessText) livenessText.textContent = "LIVENESS CHECK READY";
      }
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Strict Live Camera access is required to complete profile setup. Please enable camera access.");
      if (livenessText) livenessText.textContent = "CAMERA ERROR";
    }
  }

  // Function to stop camera
  function stopLiveCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (cameraVideo) cameraVideo.srcObject = null;
  }

  // Make startLiveCamera globally referenceable
  window.startLiveCamera = startLiveCamera;

  // Capture photo with simulated liveness scan stages
  if (captureBtn) {
    captureBtn.addEventListener('click', async () => {
      if (!stream) {
        alert("Camera stream is not active.");
        return;
      }

      captureBtn.disabled = true;

      if (faceGuide) faceGuide.classList.add('scanning');
      if (scannerLine) scannerLine.classList.add('scanning');
      if (scanningGrid) scanningGrid.classList.add('scanning');

      const scanStages = [
        { text: "SCANNING FACE DEPTH...", delay: 500 },
        { text: "DETECTING MICRO-MOVEMENTS...", delay: 1000 },
        { text: "VERIFYING BLINK & REFLECTIONS...", delay: 1600 },
        { text: "LIVENESS CHECKS PASSED!", delay: 2000 }
      ];

      for (const stage of scanStages) {
        await new Promise(r => setTimeout(r, stage.delay - (scanStages[scanStages.indexOf(stage) - 1]?.delay || 0)));
        if (livenessText) livenessText.textContent = stage.text;
      }

      // Draw frames to canvas
      cameraCanvas.width = cameraVideo.videoWidth || 640;
      cameraCanvas.height = cameraVideo.videoHeight || 640;
      const ctx = cameraCanvas.getContext('2d');
      ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
      
      const dataUrl = cameraCanvas.toDataURL('image/jpeg');

      if (faceGuide) faceGuide.classList.remove('scanning');
      if (scannerLine) scannerLine.classList.remove('scanning');
      if (scanningGrid) scanningGrid.classList.remove('scanning');

      previewImg.src = dataUrl;
      document.getElementById('camera-container').classList.remove('active');
      previewContainer.style.display = 'block';
      finishBtn.disabled = false;
      captureBtn.disabled = false;

      stopLiveCamera();
    });
  }

  if (removeImgBtn) {
    removeImgBtn.addEventListener('click', () => {
      previewImg.src = "";
      previewContainer.style.display = 'none';
      document.getElementById('camera-container').classList.add('active');
      finishBtn.disabled = true;
      startLiveCamera();
    });
  }

  // Finish Setup
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      const base64 = previewImg.src;
      if (!base64) return;
      
      localStorage.setItem('invibeProfileImage', base64);
      localStorage.setItem('invibeIsLoggedIn', 'true');
      
      modal.classList.remove('active');
      const authView = document.getElementById('auth-view');
      if (authView) authView.classList.add('hidden');
      
      setTimeout(() => {
        if (authView) authView.style.display = 'none';
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
          appContainer.style.display = 'block';
        }
        updateAppUI();
      }, 500);
    });
  }
}

export function updateAppUI() {
  const userStr = localStorage.getItem('invibeUser');
  const profileImage = localStorage.getItem('invibeProfileImage');
  
  if (!userStr) return;
  
  const user = JSON.parse(userStr);
  
  // Update Header Avatar
  const headerAvatar = document.querySelector('#header-profile-avatar img');
  if (headerAvatar && profileImage) {
    headerAvatar.src = profileImage;
  }

  // Update Sidebar Preview Card
  const sidebarAvatar = document.querySelector('.profile-preview-avatar img');
  if (sidebarAvatar && profileImage) {
    sidebarAvatar.src = profileImage;
  }
  const sidebarName = document.querySelector('.profile-preview-info h3');
  if (sidebarName) {
    sidebarName.textContent = user.fullName;
  }
  const sidebarUsername = document.querySelector('.profile-preview-info p');
  if (sidebarUsername) {
    sidebarUsername.textContent = '@' + user.username;
  }

  // Update Story "Your Vibe"
  const storyAvatar = document.querySelector('.story-card.current-user .story-avatar-container img');
  if (storyAvatar && profileImage) {
    storyAvatar.src = profileImage;
  }

  // Update "My Profile" view
  const myProfileAvatar = document.querySelector('.profile-header-avatar img');
  if (myProfileAvatar && profileImage) {
    myProfileAvatar.src = profileImage;
  }
  const myProfileName = document.querySelector('.profile-header-info h2');
  if (myProfileName) {
    myProfileName.innerHTML = user.fullName + ' <span class="verified-badge"><i data-lucide="check"></i></span>';
  }
  const myProfileUsername = document.querySelector('.profile-header-info p.profile-username');
  if (myProfileUsername) {
    myProfileUsername.textContent = '@' + user.username;
  }
}
