import {
	createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged,
	sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
	signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
	addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp,
	setDoc, Timestamp, updateDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { initializeLocationPicker } from "./location-picker.js";

const page = document.body.dataset.page;
const pageStatus = document.getElementById("page-status") || document.getElementById("list-status");
let firebase;
let firebaseInitializationError = null;
let currentUser = null;
const adminEmail = "hmdshfikulislam@gmail.com";

function setStatus(message, isError = false) {
	if (!pageStatus) return;
	pageStatus.textContent = message;
	pageStatus.classList.toggle("error", isError);
}

function displayError(error, fallback) {
	console.error(fallback, error);
	if (error && ["permission-denied", "unauthorized"].includes(error.code)) {
		return "এই কাজের অনুমতি নেই। অ্যাকাউন্ট ও Firebase Security Rules যাচাই করুন।";
	}
	if (error && ["unavailable", "network-request-failed"].includes(error.code)) {
		return "ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।";
	}
	return fallback;
}

function isAdmin(user) {
	return Boolean(user?.emailVerified && user.email === adminEmail);
}

function redirectToLogin() {
	if (page === "admin") {
		location.replace("login.html");
		return;
	}
	const next = `${location.pathname.split("/").pop()}${location.search}`;
	location.replace(`login.html?next=${encodeURIComponent(next)}`);
}

function redirectAfterLogin() {
	const requested = new URLSearchParams(location.search).get("next");
	const allowedPages = [
		"index.html", "report-lost.html", "report-found.html",
		"admin/index.html", "admin.html"
	];
	location.replace(allowedPages.includes(requested) ? requested : "index.html");
}

function textValue(formData, name) {
	const value = formData.get(name);
	return typeof value === "string" ? value.trim() : "";
}

function appendDetail(container, label, value) {
	if (!value) return;
	const detail = document.createElement("p");
	detail.className = "post-detail";
	detail.textContent = `${label}: ${value}`;
	container.append(detail);
}

function makePostCard(post) {
	const card = document.createElement("article");
	card.className = "post-card";

	const placeholder = document.createElement("div");
	placeholder.className = "post-image post-image-placeholder";
	placeholder.setAttribute("aria-hidden", "true");
	placeholder.textContent = "♡";
	card.append(placeholder);
	if (post.imagePath) {
		getDownloadURL(ref(firebase.storage, post.imagePath)).then((imageUrl) => {
			const image = document.createElement("img");
			image.className = "post-image";
			image.src = imageUrl;
			image.alt = post.name ? `${post.name} — ছবি` : "খুঁজে পাওয়া ব্যক্তির ছবি";
			image.loading = "lazy";
			placeholder.replaceWith(image);
		}).catch((error) => {
			console.error("Could not load report photo", error);
		});
	}

	const content = document.createElement("div");
	content.className = "post-content";
	const badge = document.createElement("span");
	const isLost = post.type === "lost";
	badge.className = `post-badge ${isLost ? "lost" : "found"}`;
	badge.textContent = isLost ? "হারানো" : "পাওয়া গেছে";

	const heading = document.createElement("h3");
	const name = post.name || "নাম জানা নেই";
	heading.textContent = post.age ? `${name} · ${post.age} বছর` : name;
	const details = document.createElement("div");
	details.className = "post-details";

	if (isLost) {
		appendDetail(details, "শেষ দেখা গেছে", post.lastSeen);
		appendDetail(details, "ঠিকানা", post.address);
		appendDetail(details, "পোশাক", post.dress);
		appendDetail(details, "বিবরণ", post.desc);
	} else {
		appendDetail(details, "পাওয়া গেছে", post.foundLocation || post.location);
		appendDetail(details, "এখন আছেন", post.currentLocation);
	}

	content.append(badge, heading, details);
	card.append(content);
	return card;
}

function createdAtMillis(post) {
	return post.createdAt && typeof post.createdAt.toMillis === "function"
		? post.createdAt.toMillis()
		: 0;
}

async function loadVerifiedPosts() {
	const list = document.getElementById("post-list");
	const search = document.getElementById("post-search");
	if (!list || !search) return;

	setStatus("বিজ্ঞপ্তি লোড হচ্ছে...");
	const postsQuery = query(
		collection(firebase.db, "posts"),
		where("verified", "==", true),
		orderBy("createdAt", "desc"),
		limit(100)
	);
	const snapshot = await getDocs(postsQuery);
	const posts = snapshot.docs
		.map((postDoc) => ({ id: postDoc.id, ...postDoc.data() }))
		.sort((a, b) => createdAtMillis(b) - createdAtMillis(a));

	function render() {
		const term = search.value.trim().toLocaleLowerCase();
		const matches = posts.filter((post) => {
			const searchable = [
				post.name, post.age, post.address, post.lastSeen, post.dress,
				post.desc, post.currentLocation, post.foundLocation
			].filter(Boolean).join(" ").toLocaleLowerCase();
			return searchable.includes(term);
		});

		list.replaceChildren();
		if (!matches.length) {
			const empty = document.createElement("div");
			empty.className = "empty-state";
			empty.textContent = term
				? "আপনার খোঁজের সঙ্গে মেলে এমন কোনো যাচাইকৃত বিজ্ঞপ্তি পাওয়া যায়নি।"
				: "এখনো কোনো যাচাইকৃত বিজ্ঞপ্তি নেই। আপনি তথ্য দিয়ে কাউকে খুঁজে পেতে সাহায্য করতে পারেন।";
			list.append(empty);
		} else {
			matches.forEach((post) => list.append(makePostCard(post)));
		}
		setStatus(`${matches.length}টি বিজ্ঞপ্তি দেখানো হচ্ছে।`);
	}

	search.addEventListener("input", render);
	render();
}

const adminAttemptStorageKey = "aponjon_admin_login_attempts";
const adminMaxAttempts = 5;
const adminBaseCooldownMs = 30_000;
const adminMaxCooldownMs = 15 * 60_000;

function readAdminAttemptState() {
	const raw = localStorage.getItem(adminAttemptStorageKey);
	if (!raw) return { failures: 0, blockedUntil: 0 };
	const state = JSON.parse(raw);
	if (!state || !Number.isInteger(state.failures) || state.failures < 0
		|| !Number.isFinite(state.blockedUntil) || state.blockedUntil < 0) {
		throw new Error("Admin login rate-limit state is invalid.");
	}
	return state;
}

function recordAdminLoginFailure(state) {
	const failures = state.failures + 1;
	const lockLevel = Math.max(0, Math.floor((failures - adminMaxAttempts) / 2));
	const blockedUntil = failures >= adminMaxAttempts
		? Date.now() + Math.min(adminMaxCooldownMs, adminBaseCooldownMs * (2 ** lockLevel))
		: 0;
	const updated = { failures, blockedUntil };
	localStorage.setItem(adminAttemptStorageKey, JSON.stringify(updated));
	return updated;
}

function clearAdminLoginFailures() {
	localStorage.removeItem(adminAttemptStorageKey);
}

async function initializeAdminLogin(auth) {
	const form = document.getElementById("admin-login-form");
	const emailInput = document.getElementById("admin-email");
	const passwordInput = document.getElementById("admin-password");
	const submitButton = document.getElementById("admin-login-submit");
	const resetButton = document.getElementById("admin-password-reset");
	if (!form || !emailInput || !passwordInput || !submitButton || !resetButton) return;

	let cooldownTimer = 0;
	let loginInProgress = false;

	function setAdminStatus(message, isError = false) {
		setStatus(message, isError);
		const status = document.getElementById("page-status");
		if (status) status.setAttribute("role", isError ? "alert" : "status");
	}

	function updateCooldown() {
		window.clearTimeout(cooldownTimer);
		let state;
		try {
			state = readAdminAttemptState();
		} catch (error) {
			console.error("Could not read admin login throttle state", error);
			submitButton.disabled = true;
			setAdminStatus("নিরাপত্তা সীমা যাচাই করা যায়নি। এই সাইটের browser storage ঠিক করে আবার চেষ্টা করুন।", true);
			return false;
		}

		const secondsRemaining = Math.ceil((state.blockedUntil - Date.now()) / 1000);
		if (secondsRemaining > 0) {
			submitButton.disabled = true;
			submitButton.textContent = `অপেক্ষা করুন (${secondsRemaining} সেকেন্ড)`;
			setAdminStatus("বারবার ব্যর্থ login হওয়ায় সাময়িকভাবে চেষ্টা বন্ধ রাখা হয়েছে।", true);
			cooldownTimer = window.setTimeout(updateCooldown, 1000);
			return false;
		}

		submitButton.disabled = false;
		submitButton.textContent = "নিরাপদে লগইন করুন";
		return true;
	}

	onAuthStateChanged(auth, async (user) => {
		if (!user) return;
		if (loginInProgress) return;
		try {
			if (await isAdmin(user)) {
				if (auth.currentUser?.uid !== user.uid) return;
				location.replace("index.html");
				return;
			}
			if (auth.currentUser?.uid !== user.uid) return;
			await signOut(auth);
			setAdminStatus("বর্তমান account-টি অনুমোদিত admin নয়।", true);
		} catch (error) {
			console.error("Could not validate existing admin session", error);
			setAdminStatus(displayError(error, "Admin অনুমতি যাচাই করা যায়নি। Firebase setup পরীক্ষা করুন।"), true);
		}
	});

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!form.reportValidity() || !updateCooldown()) return;
		const email = emailInput.value.trim().toLowerCase();
		const password = passwordInput.value;
		submitButton.disabled = true;
		loginInProgress = true;
		setAdminStatus("Admin account যাচাই করা হচ্ছে...");
		try {
			const credential = await signInWithEmailAndPassword(auth, email, password);
			if (!credential.user.emailVerified) {
				await sendEmailVerification(credential.user);
				await signOut(auth);
				setAdminStatus("Email যাচাই করা হয়নি। Inbox-এ পাঠানো verification link খুলে আবার চেষ্টা করুন।", true);
				updateCooldown();
				return;
			}
			if (!await isAdmin(credential.user)) {
				await signOut(auth);
				recordAdminLoginFailure(readAdminAttemptState());
				setAdminStatus("এই account অনুমোদিত admin নয় অথবা email যাচাই করা হয়নি।", true);
				updateCooldown();
				return;
			}
			clearAdminLoginFailures();
			location.replace("index.html");
		} catch (error) {
			if (error && error.code === "auth/too-many-requests") {
				const state = readAdminAttemptState();
				state.failures = Math.max(state.failures, adminMaxAttempts - 1);
				const locked = recordAdminLoginFailure(state);
				setAdminStatus("Firebase নিরাপত্তার কারণে login সাময়িকভাবে সীমিত করেছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।", true);
				if (!locked.blockedUntil) {
					localStorage.setItem(adminAttemptStorageKey, JSON.stringify({
						...locked,
						blockedUntil: Date.now() + adminBaseCooldownMs
					}));
				}
				updateCooldown();
			} else if (error && ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(error.code)) {
				const state = recordAdminLoginFailure(readAdminAttemptState());
				setAdminStatus("Email অথবা password সঠিক নয়, অথবা account admin হিসেবে অনুমোদিত নয়।", true);
				updateCooldown();
				if (state.blockedUntil > Date.now()) updateCooldown();
			} else {
				console.error("Admin sign-in failed", error);
				setAdminStatus(displayError(error, "Admin login সম্পন্ন হয়নি। সংযোগ ও Firebase Authentication setup পরীক্ষা করুন।"), true);
				updateCooldown();
			}
		} finally {
			loginInProgress = false;
			passwordInput.value = "";
		}
	});

	resetButton.addEventListener("click", async () => {
		const email = emailInput.value.trim().toLowerCase();
		if (!emailInput.validity.valid || !email) {
			emailInput.focus();
			setAdminStatus("Password reset link পেতে admin email লিখুন।", true);
			return;
		}
		resetButton.disabled = true;
		try {
			await sendPasswordResetEmail(auth, email);
		} catch (error) {
			if (!error || error.code !== "auth/user-not-found") {
				console.error("Could not send admin password reset email", error);
			}
		} finally {
			resetButton.disabled = false;
			setAdminStatus("যদি এই email-এ কোনো account থাকে, password reset নির্দেশনা পাঠানো হয়েছে।");
		}
	});

	updateCooldown();
}

async function initializeLogin(auth) {
	const form = document.getElementById("email-auth-form");
	const emailInput = document.getElementById("visitor-email");
	const passwordInput = document.getElementById("visitor-password");
	const submitButton = document.getElementById("email-auth-submit");
	const modeToggle = document.getElementById("auth-mode-toggle");
	const googleButton = document.getElementById("google-sign-in");
	const heading = document.getElementById("login-heading");
	const description = document.getElementById("auth-mode-description");
	if (!form || !emailInput || !passwordInput || !submitButton || !modeToggle || !googleButton || !heading || !description) return;

	let isRegistration = false;
	let authInProgress = false;

	onAuthStateChanged(auth, (user) => {
		if (user) redirectAfterLogin();
	});

	function setMode(registration) {
		isRegistration = registration;
		heading.textContent = registration ? "নতুন account তৈরি করুন" : "Email দিয়ে প্রবেশ";
		description.textContent = registration
			? "আপনার email ও password দিয়ে নতুন account তৈরি করুন।"
			: "আপনার email ও password দিয়ে লগইন করুন।";
		submitButton.textContent = registration ? "রেজিস্ট্রেশন করুন" : "লগইন করুন";
		passwordInput.autocomplete = registration ? "new-password" : "current-password";
		modeToggle.textContent = registration
			? "আগে account আছে? লগইন করুন"
			: "নতুন account? রেজিস্ট্রেশন করুন";
		setStatus("");
	}

	modeToggle.addEventListener("click", () => setMode(!isRegistration));
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!form.reportValidity() || authInProgress) return;
		authInProgress = true;
		submitButton.disabled = true;
		googleButton.disabled = true;
		setStatus(isRegistration ? "নতুন account তৈরি হচ্ছে..." : "লগইন করা হচ্ছে...");
		try {
			const email = emailInput.value.trim().toLowerCase();
			if (isRegistration) {
				await createUserWithEmailAndPassword(auth, email, passwordInput.value);
				redirectAfterLogin();
			} else {
				await signInWithEmailAndPassword(auth, email, passwordInput.value);
				redirectAfterLogin();
			}
		} catch (error) {
			const messages = {
				"auth/email-already-in-use": "এই email দিয়ে account আছে। লগইন করুন অথবা অন্য email ব্যবহার করুন।",
				"auth/invalid-credential": "Email অথবা password সঠিক নয়।",
				"auth/invalid-email": "সঠিক email address লিখুন।",
				"auth/weak-password": "Password কমপক্ষে ৬ অক্ষরের হতে হবে।",
				"auth/operation-not-allowed": "Firebase Authentication-এ Email/Password provider চালু করুন।",
				"auth/too-many-requests": "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
			};
			setStatus(messages[error?.code] || displayError(error, "লগইন বা রেজিস্ট্রেশন সম্পন্ন হয়নি। আবার চেষ্টা করুন।"), true);
		} finally {
			authInProgress = false;
			submitButton.disabled = false;
			googleButton.disabled = false;
			passwordInput.value = "";
		}
	});

	googleButton.addEventListener("click", async () => {
		if (authInProgress) return;
		authInProgress = true;
		submitButton.disabled = true;
		googleButton.disabled = true;
		setStatus("Google account দিয়ে প্রবেশ করা হচ্ছে...");
		try {
			await signInWithPopup(auth, new GoogleAuthProvider());
			redirectAfterLogin();
		} catch (error) {
			const messages = {
				"auth/popup-closed-by-user": "Google login সম্পন্ন হয়নি। আবার চেষ্টা করুন।",
				"auth/popup-blocked": "Browser popup আটকে দিয়েছে। popup অনুমতি দিয়ে আবার চেষ্টা করুন।",
				"auth/operation-not-allowed": "Firebase Authentication-এ Google provider চালু করুন।",
				"auth/account-exists-with-different-credential": "এই email-এ অন্য পদ্ধতিতে account আছে। সেই পদ্ধতিতে লগইন করুন।"
			};
			setStatus(messages[error?.code] || displayError(error, "Google দিয়ে লগইন করা যায়নি। আবার চেষ্টা করুন।"), true);
		} finally {
			authInProgress = false;
			submitButton.disabled = false;
			googleButton.disabled = false;
		}
	});
}

function readImage(file) {
	return new Promise((resolve, reject) => {
		if (!file) {
			resolve("");
			return;
		}
		if (!file.type.startsWith("image/")) {
			reject(new Error("অনুগ্রহ করে একটি ছবির ফাইল নির্বাচন করুন।"));
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			reject(new Error("ছবির আকার ৫ MB-এর কম হতে হবে।"));
			return;
		}
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			if (typeof reader.result === "string") resolve(reader.result);
			else reject(new Error("ছবিটি পড়া যায়নি।"));
		});
		reader.addEventListener("error", () => reject(new Error("ছবিটি পড়া যায়নি।")));
		reader.readAsDataURL(file);
	});
}

function getAutoCheckIssues(notice) {
	const description = typeof notice.desc === "string" ? notice.desc : "";
	const name = typeof notice.name === "string" ? notice.name : "";
	const location = [
		notice.address, notice.location, notice.lastSeen, notice.foundLocation,
		notice.currentLocation, notice.dress
	].filter((value) => typeof value === "string").join(" ");
	const combinedText = `${description} ${name} ${location}`.toLocaleLowerCase();
	const bannedWords = [
		"ভুয়া", "ভূয়া", "প্রতারণা", "প্রতারনা", "বাটপার", "চিটার", "cheater", "fake", "scam", "fraud", "প্রতারক",
		"বোকাচোদা", "মাদারচোদ", "খানকি", "মাগি", "চুদ", "চোদ", "fuck", "bitch", "sex", "xxx", "porn", "nude",
		"জঙ্গি", "সন্ত্রাসী", "বোমা", "মার্ডার", "murder", "kill", "ধর্ষণ", "rape",
		"আওয়ামী", "বিএনপি", "জামাত", "রাজাকার", "নাস্তিক", "কাফের",
		"লটারি", "lottery", "বিকাশে টাকা", "নগদে টাকা", "ক্লিক করুন", "earn money", "ঘরে বসে আয়",
		"017", "018", "019", "016", "013", "ফোন করুন", "কল করুন", "call me"
	];
	const issues = [];

	if (name.trim().length < 3) issues.push("নাম নেই বা অসম্পূর্ণ");
	if (!location.trim()) issues.push("ঠিকানা/অবস্থান নেই");
	if (!notice.imagePath) issues.push("ছবি নেই");
	if (description.trim().length < 20) issues.push("বিবরণ খুব ছোট");

	const matchedWords = bannedWords.filter((word) => combinedText.includes(word.toLocaleLowerCase()));
	for (const word of matchedWords) {
		issues.push(`খারাপ শব্দ আছে: ${word}`);
	}
	return issues;
}

function getPendingReason(notice) {
	return getAutoCheckIssues(notice)[0] || "";
}

async function getRecentSubmissionWarning(user) {
	const cutoff = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
	const recentQuery = query(
		collection(firebase.db, "posts"),
		where("createdBy", "==", user.uid),
		where("createdAt", ">=", cutoff),
		limit(2)
	);
	const recentSnapshot = await getDocs(recentQuery);
	return recentSnapshot.size >= 2
		? "১০ মিনিটে একই account থেকে ২টির বেশি বিজ্ঞপ্তি জমা পড়েছে"
		: "";
}

async function submitReport(user) {
	const form = document.getElementById("report-form");
	const imageInput = document.getElementById("report-image");
	const preview = document.getElementById("image-preview");
	if (!form || !imageInput || !preview) return;
	try {
		await Promise.all(
			Array.from(form.querySelectorAll("[data-location-picker]"), initializeLocationPicker)
		);
	} catch (error) {
		console.error("Could not initialize the Bangladesh location picker", error);
		setStatus(error instanceof Error ? error.message : "এলাকার তালিকা লোড করা যায়নি।", true);
		return;
	}

	imageInput.addEventListener("change", async () => {
		preview.hidden = true;
		preview.removeAttribute("src");
		try {
			const image = await readImage(imageInput.files && imageInput.files[0]);
			if (image) {
				preview.src = image;
				preview.hidden = false;
			}
			setStatus("");
		} catch (error) {
			imageInput.value = "";
			setStatus(error.message, true);
		}
	});

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!form.reportValidity()) return;

		const submitButton = form.querySelector('button[type="submit"]');
		submitButton.disabled = true;
		setStatus("বিজ্ঞপ্তি জমা দেওয়া হচ্ছে...");
		let uploadedPath = "";
		try {
			const formData = new FormData(form);
			const type = page === "report-lost" ? "lost" : "found";
			const imageFile = imageInput.files && imageInput.files[0];
			const postRef = doc(collection(firebase.db, "posts"));

			const lastSeen = textValue(formData, "lastSeen");
			const foundLocation = textValue(formData, "foundLocation");
			const parseLocation = (name) => {
				const value = textValue(formData, name);
				return value ? JSON.parse(value) : null;
			};
			const post = {
				type,
				name: textValue(formData, "name"),
				age: textValue(formData, "age"),
				address: textValue(formData, "address"),
				lastSeen,
				dress: textValue(formData, "dress"),
				desc: textValue(formData, "desc"),
				currentLocation: textValue(formData, "currentLocation"),
				foundLocation,
				location: type === "lost" ? lastSeen : foundLocation,
				imagePath: imageFile ? "selected" : "",
				createdBy: user.uid,
				createdAt: serverTimestamp(),
				verified: false
			};
			if (type === "lost") {
				const locationDetails = parseLocation("lastSeenLocation");
				if (!locationDetails) throw new Error("শেষ দেখা যাওয়ার বিভাগ, জেলা ও উপজেলা/থানা নির্বাচন করুন।");
				post.lastSeenLocation = locationDetails;
			} else {
				const foundDetails = parseLocation("foundLocationDetails");
				if (!foundDetails) throw new Error("পাওয়া যাওয়ার বিভাগ, জেলা ও উপজেলা/থানা নির্বাচন করুন।");
				post.foundLocationDetails = foundDetails;
				const currentDetails = parseLocation("currentLocationDetails");
				if (currentDetails) post.currentLocationDetails = currentDetails;
			}

			let pendingReason = getPendingReason(post);
			if (!pendingReason) pendingReason = await getRecentSubmissionWarning(user);
			if (pendingReason) post.pendingReason = pendingReason;

			if (imageFile) {
				if (imageFile.size > 5 * 1024 * 1024 || !imageFile.type.startsWith("image/")) {
					throw new Error("একটি ছবি নির্বাচন করুন যার আকার ৫ MB-এর কম।");
				}
				uploadedPath = `post-images/${user.uid}/${postRef.id}`;
				const imageRef = ref(firebase.storage, uploadedPath);
				await uploadBytes(imageRef, imageFile, { contentType: imageFile.type });
				post.imagePath = uploadedPath;
			}

			await setDoc(postRef, post);
			location.replace("index.html?submitted=1");
		} catch (error) {
			if (uploadedPath) {
				try {
					await deleteObject(ref(firebase.storage, uploadedPath));
				} catch (cleanupError) {
					console.error("Could not remove an incomplete report image", cleanupError);
				}
			}
			const fallback = error instanceof Error && error.message
				? error.message
				: "বিজ্ঞপ্তি জমা দেওয়া যায়নি। সংযোগ ও Firebase সেটআপ পরীক্ষা করুন।";
			setStatus(displayError(error, fallback), true);
		} finally {
			submitButton.disabled = false;
		}
	});
}

async function loadPendingPosts(user, authorizedAdmin) {
	const list = document.getElementById("pending-list");
	const adminTitle = document.getElementById("admin-title");
	const pendingCount = document.getElementById("pending-count");
	if (!list) return;

	if (!authorizedAdmin) {
		if (adminTitle) adminTitle.textContent = "এডমিন অনুমতি নেই";
		setStatus("এই account-টি এডমিন হিসেবে অনুমোদিত নয়।", true);
		return;
	}

	setStatus("যাচাইয়ের অপেক্ষায় থাকা বিজ্ঞপ্তি লোড হচ্ছে...");
	const pendingQuery = query(collection(firebase.db, "posts"), where("verified", "==", false));
	const snapshot = await getDocs(pendingQuery);
	const posts = snapshot.docs.map((postDoc) => ({ id: postDoc.id, ...postDoc.data() }));
	posts.sort((a, b) => createdAtMillis(a) - createdAtMillis(b));
	list.replaceChildren();
	if (pendingCount) pendingCount.textContent = String(posts.length);

	if (!posts.length) {
		setStatus("যাচাইয়ের অপেক্ষায় কোনো বিজ্ঞপ্তি নেই।");
		return;
	}

	for (const post of posts) {
		const screeningIssues = getAutoCheckIssues(post);
		if (post.pendingReason && !screeningIssues.includes(post.pendingReason)) {
			screeningIssues.push(post.pendingReason);
		}
		const passedAutoCheck = screeningIssues.length === 0;
		const wrapper = document.createElement("article");
		wrapper.className = `admin-card ${passedAutoCheck ? "admin-card-safe" : "admin-card-flagged"}`;
		wrapper.append(makePostCard(post));
		const screeningStatus = document.createElement("p");
		screeningStatus.className = `admin-screening-status ${passedAutoCheck ? "passed" : "flagged"}`;
		screeningStatus.textContent = passedAutoCheck
			? "✅ Auto-check Passed - Approve করতে পারেন"
			: `⚠️ কারণ: ${screeningIssues.join(" · ⚠️ কারণ: ")}`;
		wrapper.append(screeningStatus);
		const actions = document.createElement("div");
		actions.className = "admin-actions";

		const approve = document.createElement("button");
		approve.type = "button";
		approve.className = "button button-green";
		approve.textContent = passedAutoCheck ? "যাচাই করে প্রকাশ করুন" : "পর্যালোচনা করে প্রকাশ করুন";
		approve.addEventListener("click", async () => {
			approve.disabled = true;
			setStatus("বিজ্ঞপ্তিটি যাচাই করে প্রকাশ করা হচ্ছে...");
			try {
				await updateDoc(doc(firebase.db, "posts", post.id), {
					verified: true,
					verifiedBy: user.uid,
					verifiedAt: serverTimestamp()
				});
				wrapper.remove();
				if (pendingCount) pendingCount.textContent = String(list.children.length);
				const publishedCount = document.getElementById("published-count");
				if (publishedCount && /^\d+$/.test(publishedCount.textContent)) {
					publishedCount.textContent = String(Number(publishedCount.textContent) + 1);
				}
				void loadPublishedPosts(true);
				setStatus("বিজ্ঞপ্তিটি প্রকাশ করা হয়েছে।");
				if (!list.children.length) setStatus("যাচাইয়ের অপেক্ষায় কোনো বিজ্ঞপ্তি নেই।");
			} catch (error) {
				approve.disabled = false;
				setStatus(displayError(error, "বিজ্ঞপ্তিটি যাচাই করা যায়নি। আবার চেষ্টা করুন।"), true);
			}
		});
		actions.append(approve);

		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "button button-danger";
		remove.textContent = "বিজ্ঞপ্তি মুছে দিন";
		remove.addEventListener("click", async () => {
			if (!window.confirm("এই বিজ্ঞপ্তিটি স্থায়ীভাবে মুছে ফেলবেন?")) return;
			remove.disabled = true;
			setStatus("বিজ্ঞপ্তিটি মুছে ফেলা হচ্ছে...");
			try {
				if (post.imagePath) await deleteObject(ref(firebase.storage, post.imagePath));
				await deleteDoc(doc(firebase.db, "posts", post.id));
				wrapper.remove();
				if (pendingCount) pendingCount.textContent = String(list.children.length);
				setStatus(list.children.length ? "বিজ্ঞপ্তিটি মুছে ফেলা হয়েছে।" : "যাচাইয়ের অপেক্ষায় কোনো বিজ্ঞপ্তি নেই।");
			} catch (error) {
				remove.disabled = false;
				setStatus(displayError(error, "বিজ্ঞপ্তিটি মুছে ফেলা যায়নি। আবার চেষ্টা করুন।"), true);
			}
		});
		actions.append(remove);
		wrapper.append(actions);
		list.append(wrapper);
	}
	setStatus(`${posts.length}টি বিজ্ঞপ্তি যাচাইয়ের অপেক্ষায় আছে।`);
}

async function loadPublishedPosts(authorizedAdmin) {
	const list = document.getElementById("published-list");
	const status = document.getElementById("published-admin-status");
	const publishedCount = document.getElementById("published-count");
	if (!list || !status) return;
	if (!authorizedAdmin) {
		status.textContent = "শুধু অনুমোদিত এডমিন প্রকাশিত বিজ্ঞপ্তি পরিচালনা করতে পারবেন।";
		status.classList.add("error");
		return;
	}

	status.textContent = "প্রকাশিত বিজ্ঞপ্তি লোড হচ্ছে...";
	status.classList.remove("error");
	try {
		const publishedQuery = query(collection(firebase.db, "posts"), where("verified", "==", true));
		const snapshot = await getDocs(publishedQuery);
		const posts = snapshot.docs.map((postDoc) => ({ id: postDoc.id, ...postDoc.data() }));
		posts.sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
		list.replaceChildren();
		if (publishedCount) publishedCount.textContent = String(posts.length);

		if (!posts.length) {
			status.textContent = "এখনো কোনো বিজ্ঞপ্তি প্রকাশ করা হয়নি।";
			return;
		}

		for (const post of posts) {
			const wrapper = document.createElement("article");
			wrapper.className = "admin-card admin-card-published";
			wrapper.append(makePostCard(post));

			const publishedStatus = document.createElement("p");
			publishedStatus.className = "admin-screening-status passed";
			publishedStatus.textContent = "✅ এডমিন যাচাই করে প্রকাশ করেছেন";
			wrapper.append(publishedStatus);

			const actions = document.createElement("div");
			actions.className = "admin-actions";
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "button button-danger";
			remove.textContent = "বিজ্ঞপ্তি মুছে দিন";
			remove.addEventListener("click", async () => {
				if (!window.confirm("এই প্রকাশিত বিজ্ঞপ্তিটি স্থায়ীভাবে মুছে ফেলবেন?")) return;
				remove.disabled = true;
				status.textContent = "বিজ্ঞপ্তিটি মুছে ফেলা হচ্ছে...";
				status.classList.remove("error");
				try {
					if (post.imagePath) await deleteObject(ref(firebase.storage, post.imagePath));
					await deleteDoc(doc(firebase.db, "posts", post.id));
					wrapper.remove();
					if (publishedCount) publishedCount.textContent = String(list.children.length);
					status.textContent = list.children.length
						? "বিজ্ঞপ্তিটি মুছে ফেলা হয়েছে।"
						: "এখনো কোনো বিজ্ঞপ্তি প্রকাশ করা হয়নি।";
				} catch (error) {
					remove.disabled = false;
					status.textContent = displayError(error, "বিজ্ঞপ্তিটি মুছে ফেলা যায়নি। আবার চেষ্টা করুন।");
					status.classList.add("error");
				}
			});
			actions.append(remove);
			wrapper.append(actions);
			list.append(wrapper);
		}
		status.textContent = `${posts.length}টি প্রকাশিত বিজ্ঞপ্তি।`;
	} catch (error) {
		status.textContent = displayError(error, "প্রকাশিত বিজ্ঞপ্তি লোড করা যায়নি। Firebase Security Rules ও সংযোগ পরীক্ষা করুন।");
		status.classList.add("error");
	}
}

async function loadDonations(authorizedAdmin) {
	const list = document.getElementById("donation-list");
	const summary = document.getElementById("donation-summary");
	const status = document.getElementById("donation-admin-status");
	const donationCount = document.getElementById("donation-count");
	if (!list || !status || !summary) return;
	if (!authorizedAdmin) {
		status.textContent = "শুধু অনুমোদিত এডমিন ডোনেশন তথ্য দেখতে পারবেন।";
		status.classList.add("error");
		return;
	}

	status.textContent = "ডোনেশন তথ্য লোড হচ্ছে...";
	status.classList.remove("error");
	try {
		const donationsQuery = query(collection(firebase.db, "donations"), orderBy("createdAt", "desc"));
		const snapshot = await getDocs(donationsQuery);
		list.replaceChildren();
		summary.replaceChildren();
		if (donationCount) donationCount.textContent = String(snapshot.size);

		const paymentMethods = {
			bkash: { label: "bKash", className: "bkash" },
			nagad: { label: "নগদ", className: "nagad" },
			rocket: { label: "রকেট", className: "rocket" },
			upay: { label: "upay", className: "upay" },
			"bd-qr": { label: "দেশ থেকে (QR)", className: "other" },
			expat: { label: "প্রবাস ব্যাংক", className: "other" }
		};
		const totals = new Map(
			["bkash", "nagad", "rocket", "upay"].map((key) => [
				key,
				{ ...paymentMethods[key], count: 0, amount: 0 }
			])
		);
		for (const donationDoc of snapshot.docs) {
			const donation = donationDoc.data();
			const methodKey = typeof donation.paymentMethod === "string" ? donation.paymentMethod : "";
			const method = paymentMethods[methodKey] || { label: "অন্যান্য", className: "other" };
			const key = paymentMethods[methodKey] ? methodKey : "other";
			const amount = typeof donation.amount === "number" && Number.isFinite(donation.amount) && donation.amount >= 0
				? donation.amount
				: 0;
			const current = totals.get(key) || { ...method, count: 0, amount: 0 };
			current.count += 1;
			current.amount += amount;
			totals.set(key, current);
		}

		const formatAmount = (amount) => `৳${new Intl.NumberFormat("bn-BD", {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2
		}).format(amount)}`;
		for (const [key, details] of totals) {
			const card = document.createElement("article");
			card.className = `donation-method-summary ${details.className}`;
			const badge = document.createElement("span");
			badge.className = `donation-method-badge ${details.className}`;
			badge.textContent = details.label;
			const totalLabel = document.createElement("span");
			totalLabel.className = "donation-method-total-label";
			totalLabel.textContent = "জমা দেওয়া মোট";
			const total = document.createElement("strong");
			total.className = "donation-method-total";
			total.textContent = formatAmount(details.amount);
			const count = document.createElement("span");
			count.className = "donation-method-count";
			count.textContent = `${details.count}টি রেকর্ড`;
			card.append(badge, totalLabel, total, count);
			card.dataset.method = key;
			summary.append(card);
		}
		summary.hidden = false;

		if (snapshot.empty) {
			status.textContent = "এখনো কোনো ডোনেশন তথ্য জমা হয়নি।";
			return;
		}

		snapshot.docs.forEach((donationDoc) => {
			const donation = donationDoc.data();
			const card = document.createElement("article");
			card.className = "donation-admin-card";
			const methodKey = typeof donation.paymentMethod === "string" ? donation.paymentMethod : "";
			const method = paymentMethods[methodKey] || { label: "অন্যান্য", className: "other" };
			const heading = document.createElement("h3");
			heading.textContent = donation.showName === "public" && donation.donorName
				? donation.donorName
				: "নাম প্রকাশে অনিচ্ছুক";
			const details = document.createElement("div");
			details.className = "donation-admin-details";
			const amount = typeof donation.amount === "number" && Number.isFinite(donation.amount) && donation.amount >= 0
				? donation.amount
				: 0;
			appendDetail(details, "জমা দেওয়া পরিমাণ", formatAmount(amount));
			const methodBadge = document.createElement("span");
			methodBadge.className = `donation-method-badge ${method.className}`;
			methodBadge.textContent = method.label;
			const methodDetail = document.createElement("p");
			methodDetail.className = "donation-admin-method";
			methodDetail.append("পেমেন্ট মাধ্যম: ", methodBadge);
			details.append(methodDetail);
			appendDetail(details, "Email", donation.donorEmail);
			appendDetail(details, "TrxID", donation.trxId);
			appendDetail(details, "অবস্থা", donation.status === "pending" ? "যাচাই অপেক্ষমাণ" : donation.status);
			card.append(heading, details);
			list.append(card);
		});
		status.textContent = `${snapshot.size}টি ডোনেশন রেকর্ড`;
	} catch (error) {
		console.error("Could not load donation records", error);
		status.textContent = displayError(error, "ডোনেশন তথ্য লোড করা যায়নি।");
		status.classList.add("error");
		summary.replaceChildren();
		summary.hidden = true;
	}
}

async function start() {
	const submissionNotice = document.getElementById("submission-notice");
	if (submissionNotice && new URLSearchParams(location.search).get("submitted") === "1") {
		submissionNotice.hidden = false;
	}
	initializeDonateModal();

	try {
		firebase = await import("./firebase-config.js");
	} catch (error) {
		firebaseInitializationError = error;
		console.error("Firebase initialization failed", error);
		setStatus(error instanceof Error ? error.message : "Firebase সেটআপ সম্পূর্ণ করুন।", true);
		return;
	}

	if (page === "login") {
		initializeLogin(firebase.auth);
		return;
	}
	if (page === "admin-login") {
		initializeAdminLogin(firebase.auth);
		return;
	}

	const logoutButton = document.getElementById("logout-button");
	if (logoutButton) {
		logoutButton.addEventListener("click", async () => {
			try {
				await signOut(firebase.auth);
				location.replace(page === "admin" ? "login.html" : "index.html");
			} catch (error) {
				setStatus(displayError(error, "লগআউট করা যায়নি। আবার চেষ্টা করুন।"), true);
			}
		});
	}

	onAuthStateChanged(firebase.auth, async (user) => {
		currentUser = user;
		if (!user) {
			if (["home", "search", "details"].includes(page)) {
				const loginLink = document.getElementById("login-link");
				const adminLink = document.getElementById("admin-link");
				if (loginLink) loginLink.hidden = false;
				if (logoutButton) logoutButton.hidden = true;
				if (adminLink) adminLink.hidden = true;
				if (page === "home") {
					try {
						await loadVerifiedPosts();
					} catch (error) {
						setStatus(displayError(error, "তথ্য লোড করা যায়নি। Firebase Security Rules ও সংযোগ পরীক্ষা করুন।"), true);
					}
				}
				return;
			}
			redirectToLogin();
			return;
		}

		try {
			const emailLabel = document.getElementById("account-email");
			if (emailLabel) emailLabel.textContent = user.email || "";
			const adminAuthorized = await isAdmin(user);
			const adminLink = document.getElementById("admin-link");
			if (adminLink) adminLink.hidden = !adminAuthorized;
			const loginLink = document.getElementById("login-link");
			if (loginLink) loginLink.hidden = true;
			if (logoutButton) logoutButton.hidden = false;

			if (page === "home") await loadVerifiedPosts();
			if (page === "report-lost" || page === "report-found") await submitReport(user);
			if (page === "admin") {
				if (!adminAuthorized) {
					location.replace("login.html");
					return;
				}
				await Promise.all([
					loadPendingPosts(user, true),
					loadPublishedPosts(true),
					loadDonations(true)
				]);
			}
		} catch (error) {
			setStatus(displayError(error, "তথ্য লোড করা যায়নি। Firebase Security Rules ও সংযোগ পরীক্ষা করুন।"), true);
		}
	});
}

function initializeDonateModal() {
	const dialog = document.getElementById("donate-dialog");
	const openButton = document.getElementById("donate-open");
	const methodStep = document.getElementById("donate-method-step");
	const donationStep = document.getElementById("donate-form-step");
	const nextButton = document.getElementById("donate-next");
	const copyNumberButton = document.getElementById("donate-copy-number");
	const backButton = document.getElementById("donate-back");
	const form = document.getElementById("donation-form");
	const status = document.getElementById("donate-status");
	const submitButton = document.getElementById("donation-submit");
	const nameLabel = document.getElementById("donor-name-label");
	const nameInput = document.getElementById("donor-name");
	const nameChoices = document.querySelectorAll('input[name="showName"]');
	const tabs = [
		{ button: document.getElementById("donate-tab-bd"), panel: document.getElementById("donate-panel-bd"), canDonate: true },
		{ button: document.getElementById("donate-tab-expat"), panel: document.getElementById("donate-panel-expat"), canDonate: false }
	];
	const methodInput = document.getElementById("donation-method");
	const closeButtons = [
		document.getElementById("donate-close"),
		document.getElementById("donate-close-icon")
	].filter(Boolean);
	if (!(dialog instanceof HTMLDialogElement) || !openButton || !closeButtons.length
		|| !methodStep || !donationStep || !nextButton || !backButton || !form
		|| !status || !submitButton || !nameLabel || !nameInput || !methodInput
		|| tabs.some((tab) => !tab.button || !tab.panel)) return;

	function selectTab(selectedTab, moveFocus = false) {
		tabs.forEach((tab) => {
			const selected = tab === selectedTab;
			tab.button.classList.toggle("active", selected);
			tab.button.setAttribute("aria-selected", String(selected));
			tab.button.tabIndex = selected ? 0 : -1;
			tab.panel.hidden = !selected;
		});
		nextButton.disabled = !selectedTab.canDonate;
		nextButton.textContent = selectedTab.canDonate ? "আমি ডোনেট করেছি" : "ব্যাংক তথ্যের অপেক্ষায়";
		if (moveFocus) selectedTab.button.focus();
	}

	function showDonationStep(step) {
		const showMethods = step === 1;
		methodStep.hidden = !showMethods;
		donationStep.hidden = showMethods;
		if (showMethods) nextButton.focus();
		else document.getElementById("donation-amount").focus();
	}

	function syncDonorName() {
		const showName = form.querySelector('input[name="showName"]:checked')?.value === "public";
		nameLabel.hidden = !showName;
		nameInput.required = showName;
		if (!showName) nameInput.value = "";
	}

	openButton.addEventListener("click", () => {
		form.reset();
		syncDonorName();
		selectTab(tabs[0]);
		status.textContent = "";
		status.classList.remove("error");
		showDonationStep(1);
		dialog.showModal();
	});
	if (copyNumberButton) {
		copyNumberButton.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText("01776213676");
				copyNumberButton.textContent = "কপি হয়েছে";
			} catch (error) {
				console.error("Could not copy donation number", error);
				copyNumberButton.textContent = "কপি হয়নি";
				window.setTimeout(() => {
					copyNumberButton.textContent = "নম্বর কপি";
				}, 2000);
			}
		});
	}
	nextButton.addEventListener("click", () => showDonationStep(2));
	tabs.forEach((tab, index) => {
		tab.button.addEventListener("click", () => selectTab(tab));
		tab.button.addEventListener("keydown", (event) => {
			let nextIndex = index;
			if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
			else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
			else return;
			event.preventDefault();
			selectTab(tabs[nextIndex], true);
		});
	});
	backButton.addEventListener("click", () => {
		status.textContent = "";
		status.classList.remove("error");
		showDonationStep(1);
	});
	nameChoices.forEach((choice) => choice.addEventListener("change", syncDonorName));
	closeButtons.forEach((button) => button.addEventListener("click", () => dialog.close()));
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!form.reportValidity()) return;
		if (!firebase) {
			status.textContent = firebaseInitializationError instanceof Error
				? "ডোনেশন তথ্য জমা দিতে আগে Firebase project সেটআপ করুন।"
				: "ডোনেশন তথ্য জমা দেওয়া যাচ্ছে না।";
			status.classList.add("error");
			return;
		}
		if (!currentUser) {
			status.textContent = "তথ্য জমা দিতে আগে আপনার account দিয়ে লগইন করুন।";
			status.classList.add("error");
			return;
		}

		const formData = new FormData(form);
		const amount = Number(formData.get("amount"));
		const showName = formData.get("showName");
		const donorName = showName === "public" ? String(formData.get("donorName") || "").trim() : "";
		if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
			status.textContent = "১ থেকে ১০,০০,০০০ টাকার মধ্যে সঠিক পরিমাণ লিখুন।";
			status.classList.add("error");
			return;
		}
		if (showName === "public" && !donorName) {
			status.textContent = "নাম প্রকাশ করতে চাইলে আপনার নাম লিখুন।";
			status.classList.add("error");
			nameInput.focus();
			return;
		}

		submitButton.disabled = true;
		status.textContent = "ডোনেশন তথ্য নিরাপদে জমা হচ্ছে...";
		status.classList.remove("error");
		try {
			await addDoc(collection(firebase.db, "donations"), {
				amount,
				trxId: String(formData.get("trxId") || "").trim(),
				paymentMethod: String(formData.get("paymentMethod") || ""),
				showName,
				donorName,
				donorUid: currentUser.uid,
				donorEmail: currentUser.email || "",
				createdAt: serverTimestamp(),
				status: "pending"
			});
			form.reset();
			syncDonorName();
			status.textContent = "ধন্যবাদ! আপনার তথ্য শুধু এডমিনের কাছে জমা হয়েছে। পেমেন্ট যাচাই না হওয়া পর্যন্ত এটি নিশ্চিত ডোনেশন হিসেবে গণ্য হবে না।";
			status.classList.remove("error");
		} catch (error) {
			status.textContent = displayError(error, "তথ্য জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
			status.classList.add("error");
		} finally {
			submitButton.disabled = false;
		}
	});
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) dialog.close();
	});
	dialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			dialog.close();
		}
	});
	dialog.addEventListener("close", () => openButton.focus());
	syncDonorName();
	selectTab(tabs[0]);
}

start();
