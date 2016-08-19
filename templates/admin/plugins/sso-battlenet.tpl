<div class="row">
	<div class="col-xs-12">
		<div class="panel panel-default">
			<div class="panel-heading">Battle.net Social Authentication</div>
			<div class="panel-body">
				<p>
					Create a <strong>Battle.net Application</strong> via the
					<a href="https://dev.battle.net">battle.net Developers Page</a> and then paste your application details here.
				</p>
				<form role="form" class="sso-battlenet-settings">
					<div class="form-group">
						<label for="key">Key</label>
						<input type="text" id="key" name="key" title="Key" class="form-control" placeholder="Key"><br />
					</div>
					<div class="form-group">
						<label for="secret">Secret</label>
						<input type="text" id="secret" name="secret" title="Secret" class="form-control" placeholder="Secret">
					</div>
					<label>Region</label>
					<select class="form-control" name="region">					
						<option value="us">US</option>
						<option value="eu">EU</option>
						<option value="kr">KR</option>
						<option value="tw">TW</option>
						<option value="cn">CN</option>				
					</select>
					<div class="form-group">
						<label for="domain">Callback URL, this has to match to the URL you entered in <a href="https://dev.battle.net">https://dev.battle.net</a></label>
						<div class="input-group">
							<input type="text" id="domain" name="domain" title="Callback URL" class="form-control" placeholder="https://forum.example.org">
							<div class="input-group-addon">/auth/battlenet/callback</div>
						</div>

					</div>
				</form>
			</div>
		</div>
	</div>
</div>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>