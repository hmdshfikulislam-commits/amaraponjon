let locationDataPromise;

function loadLocationData() {
	if (!locationDataPromise) {
		locationDataPromise = fetch(new URL("public/bd.json", import.meta.url))
			.then((response) => {
				if (!response.ok) throw new Error(`বাংলাদেশের এলাকার তালিকা লোড হয়নি (HTTP ${response.status})।`);
				return response.json();
			})
			.then((data) => {
				if (!data || !Array.isArray(data.divisions) || !Array.isArray(data.districts) || !Array.isArray(data.upazilas)) {
					throw new Error("এলাকার তথ্যের ফরম্যাট সঠিক নয়। public/bd.json ফাইলটি পরীক্ষা করুন।");
				}
				return data;
			})
			.catch((error) => {
				locationDataPromise = null;
				throw error;
			});
	}
	return locationDataPromise;
}

function makeOption(value, label) {
	const option = document.createElement("option");
	option.value = value;
	option.textContent = label;
	return option;
}

function setOptions(select, records, placeholder) {
	select.replaceChildren(makeOption("", placeholder));
	records.forEach((record) => {
		select.append(makeOption(record.id, record.bn_name || record.name));
	});
	select.disabled = records.length === 0;
}

export async function initializeLocationPicker(container) {
	const divisionsSelect = container.querySelector('[data-location-level="division"]');
	const districtsSelect = container.querySelector('[data-location-level="district"]');
	const upazilasSelect = container.querySelector('[data-location-level="upazila"]');
	const villageInput = container.querySelector('[data-location-level="village"]');
	const status = container.querySelector("[data-location-status]");
	const locationInput = container.querySelector("[data-location-value]");
	const detailsInput = container.querySelector("[data-location-details]");
	const required = container.dataset.required === "true";

	if (!divisionsSelect || !districtsSelect || !upazilasSelect || !villageInput || !status || !locationInput || !detailsInput) {
		throw new Error("লোকেশন পিকার markup অসম্পূর্ণ।");
	}

	divisionsSelect.required = required;
	districtsSelect.required = false;
	upazilasSelect.required = false;
	districtsSelect.disabled = true;
	upazilasSelect.disabled = true;
	villageInput.disabled = true;
	locationInput.value = "";
	detailsInput.value = "";

	try {
		status.textContent = "বিভাগের তালিকা লোড হচ্ছে...";
		const data = await loadLocationData();
		let selectedDivision = null;
		let selectedDistrict = null;
		let selectedUpazila = null;

		setOptions(divisionsSelect, data.divisions, "বিভাগ নির্বাচন করুন");
		setOptions(districtsSelect, [], "আগে বিভাগ নির্বাচন করুন");
		setOptions(upazilasSelect, [], "আগে জেলা নির্বাচন করুন");
		villageInput.value = "";

		function updateLocation() {
			if (!selectedDivision || !selectedDistrict || !selectedUpazila) {
				locationInput.value = "";
				detailsInput.value = "";
				return;
			}

			const location = {
				division: selectedDivision.bn_name || selectedDivision.name,
				district: selectedDistrict.bn_name || selectedDistrict.name,
				thana: selectedUpazila.bn_name || selectedUpazila.name,
				village: villageInput.value.trim()
			};
			locationInput.value = [location.division, location.district, location.thana, location.village]
				.filter(Boolean)
				.join(", ");
			detailsInput.value = JSON.stringify(location);
		}

		divisionsSelect.addEventListener("change", () => {
			selectedDivision = data.divisions.find((division) => division.id === divisionsSelect.value) || null;
			selectedDistrict = null;
			selectedUpazila = null;
			villageInput.value = "";
			villageInput.disabled = true;
			setOptions(
				districtsSelect,
				selectedDivision ? data.districts.filter((district) => district.division_id === selectedDivision.id) : [],
				selectedDivision ? "জেলা নির্বাচন করুন" : "আগে বিভাগ নির্বাচন করুন"
			);
			districtsSelect.required = Boolean(selectedDivision) || required;
			setOptions(upazilasSelect, [], "আগে জেলা নির্বাচন করুন");
			upazilasSelect.required = Boolean(selectedDistrict) || required;
			updateLocation();
			status.textContent = "";
		});

		districtsSelect.addEventListener("change", () => {
			selectedDistrict = data.districts.find((district) => district.id === districtsSelect.value) || null;
			selectedUpazila = null;
			villageInput.value = "";
			villageInput.disabled = true;
			setOptions(
				upazilasSelect,
				selectedDistrict ? data.upazilas.filter((upazila) => upazila.district_id === selectedDistrict.id) : [],
				selectedDistrict ? "উপজেলা/থানা নির্বাচন করুন" : "আগে জেলা নির্বাচন করুন"
			);
			upazilasSelect.required = Boolean(selectedDistrict) || required;
			updateLocation();
			status.textContent = "";
		});

		upazilasSelect.addEventListener("change", () => {
			selectedUpazila = data.upazilas.find((upazila) => upazila.id === upazilasSelect.value) || null;
			villageInput.disabled = !selectedUpazila;
			if (!selectedUpazila) villageInput.value = "";
			updateLocation();
			status.textContent = "";
			if (selectedUpazila) villageInput.focus();
		});

		villageInput.addEventListener("input", updateLocation);
		status.textContent = "বিভাগ, জেলা ও উপজেলা/থানা নির্বাচন করুন। গ্রাম/ইউনিয়ন/ওয়ার্ড ঐচ্ছিক।";
	} catch (error) {
		status.textContent = error instanceof Error ? error.message : "এলাকার তালিকা লোড করা যায়নি।";
		status.classList.add("error");
		throw error;
	}
}
