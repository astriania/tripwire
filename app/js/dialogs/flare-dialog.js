const sendFlare = function(systemID, flare, dialog) {
			const data = {"systemID": systemID, "flare": flare};

			$.ajax({
				url: "flares.php",
				type: "POST",
				data: data,
				dataType: "JSON"
			}).done(function(data) {
				if (data && data.result) {
					chain.updateFlare(systemID, flare);
					$(dialog).dialog("close");
				}
			});
}

		$("#dialog-flare").dialog({
			autoOpen: false,
			height: "auto",
			width: 350,
			dialogClass: "dialog-noeffect ui-dialog-shadow",
			buttons: {
				'Update': function() { sendFlare($(this).data("systemID"), this.querySelector("input[name='flare-type']:checked").value, this);  },
				'Remove': function() { sendFlare($(this).data("systemID"), null, this); },
				Cancel: function() {
					$(this).dialog("close");
				},
			},
			open: function() {
				const systemID = $(this).data("systemID");
				this.systemName = tripwire.systems[systemID].name;
				const flare = chain.data.flares[systemID] || { flare: 'none' };
				
				this.querySelector("input[name='flare-type'][value='" + flare.flare + "']").checked = true;
				$(this).dialog("option", "title", this.systemName + " Flare");
			}
		});