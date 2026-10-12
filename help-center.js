const STORAGE_KEY = "helpMessages";

function createElement(tagName, attributes = {}, text = "") {
	const element = document.createElement(tagName);
	Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
	if (text) element.textContent = text;
	return element;
}

function initializeHelpCenter() {
	const trigger = createElement("button", {
		class: "help-center-button",
		type: "button",
		"aria-label": "হেল্প সেন্টার খুলুন",
		"aria-controls": "help-popup",
		"aria-expanded": "false"
	}, "💬");
	const popup = createElement("section", {
		class: "help-popup",
		id: "help-popup",
		"aria-labelledby": "help-popup-title",
		hidden: ""
	});
	const header = createElement("div", { class: "help-popup-header" });
	const title = createElement("h2", { id: "help-popup-title" }, "হেল্প সেন্টার");
	const closeButton = createElement("button", {
		class: "help-popup-close",
		type: "button",
		"aria-label": "হেল্প সেন্টার বন্ধ করুন"
	}, "×");
	const form = createElement("form", { class: "help-popup-form" });
	const intro = createElement("p", { class: "help-popup-intro" }, "আপনার বার্তা এই ব্রাউজারেই সংরক্ষিত হবে; এটি এডমিনের কাছে পাঠানো হবে না।");
	const nameInput = createElement("input", {
		class: "field",
		id: "help-name",
		name: "name",
		type: "text",
		maxlength: "100",
		autocomplete: "name",
		placeholder: "আপনার নাম (ঐচ্ছিক)"
	});
	const phoneInput = createElement("input", {
		class: "field",
		id: "help-phone",
		name: "phone",
		type: "tel",
		maxlength: "32",
		autocomplete: "tel",
		placeholder: "ফোন নম্বর (ঐচ্ছিক)"
	});
	const messageInput = createElement("textarea", {
		class: "field",
		id: "help-message",
		name: "message",
		rows: "4",
		maxlength: "1000",
		required: "",
		placeholder: "আপনার সমস্যা বা মতামত লিখুন"
	});
	const status = createElement("p", {
		class: "help-popup-status",
		role: "status",
		"aria-live": "polite"
	});
	const submitButton = createElement("button", { class: "help-popup-submit", type: "submit" }, "বার্তা সংরক্ষণ করুন");

	[
		[nameInput, "help-name", "আপনার নাম"],
		[phoneInput, "help-phone", "ফোন নম্বর"],
		[messageInput, "help-message", "আপনার বার্তা"]
	].forEach(([input, id, labelText]) => {
		form.append(createElement("label", { class: "help-popup-field", for: id }, labelText), input);
	});
	header.append(title, closeButton);
	form.prepend(intro);
	form.append(submitButton, status);
	popup.append(header, form);
	document.body.append(trigger, popup);

	function setOpen(isOpen) {
		popup.hidden = !isOpen;
		trigger.setAttribute("aria-expanded", String(isOpen));
		trigger.setAttribute("aria-label", isOpen ? "হেল্প সেন্টার বন্ধ করুন" : "হেল্প সেন্টার খুলুন");
		if (isOpen) messageInput.focus();
		else trigger.focus();
	}

	trigger.addEventListener("click", () => setOpen(popup.hidden));
	closeButton.addEventListener("click", () => setOpen(false));
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && !popup.hidden) setOpen(false);
	});
	document.querySelectorAll("[data-help-open]").forEach((link) => {
		link.addEventListener("click", (event) => {
			event.preventDefault();
			setOpen(true);
		});
	});
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const message = messageInput.value.trim();
		if (!message) {
			status.className = "help-popup-status error";
			status.textContent = "বার্তাটি লিখে তারপর সংরক্ষণ করুন।";
			messageInput.focus();
			return;
		}

		let messages;
		try {
			const storedMessages = localStorage.getItem(STORAGE_KEY);
			messages = storedMessages === null ? [] : JSON.parse(storedMessages);
		} catch (error) {
			console.error("Could not read saved help messages", error);
			status.className = "help-popup-status error";
			status.textContent = "আগের সংরক্ষিত বার্তা পড়া যায়নি। ব্রাউজারের সংরক্ষণ পরীক্ষা করুন।";
			return;
		}
		if (!Array.isArray(messages)) {
			status.className = "help-popup-status error";
			status.textContent = "সংরক্ষিত বার্তার তথ্য সঠিক নয়; নতুন বার্তা সংরক্ষণ করা যায়নি।";
			return;
		}

		messages.push({
			name: nameInput.value.trim() || "নাম দেয়নি",
			phone: phoneInput.value.trim() || "নাম্বার দেয়নি",
			message,
			time: new Date().toLocaleString("bn-BD"),
			seen: false
		});
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
		} catch (error) {
			console.error("Could not save help message", error);
			status.className = "help-popup-status error";
			status.textContent = "বার্তাটি সংরক্ষণ করা যায়নি। ব্রাউজারের storage space পরীক্ষা করুন।";
			return;
		}

		status.className = "help-popup-status success";
		status.textContent = "বার্তাটি এই ব্রাউজারে সংরক্ষিত হয়েছে; সহায়তা টিমের কাছে পাঠানো হয়নি।";
		messageInput.value = "";
	});
}

initializeHelpCenter();
