var trace_3d, layout_3d;
var updates_3d = [];
var groups_3d = [];
var num_colors = 0;

// HTML5 local storage with expiration
// https://gist.github.com/anhang/1096149
var storage = {
	save : function(key, jsonData, expirationMin){
		if (typeof (Storage) === "undefined"){return false;}
        var expirationMS = expirationMin * 60 * 1000;
		var record = {value: JSON.stringify(jsonData), timestamp: new Date().getTime() + expirationMS}
		localStorage.setItem(key, JSON.stringify(record));
		return jsonData;
	},
	load : function(key){
		if (typeof (Storage) === "undefined"){return false;}
		var record = JSON.parse(localStorage.getItem(key));
		if (!record){return false;}
		return (new Date().getTime() < record.timestamp && JSON.parse(record.value));
	} }

function save3DData(trace, layout){
    trace_3d = trace;
    layout_3d = layout;
}

function storeUpdate(update, group, empty=false) {
    if (empty === false){
        updates_3d.push(update);
        groups_3d.push(group);
    }
    else {
        updates_3d = [];
        groups_3d = [];
    }
}

function display3DPlotToggle() {
    if ($('#toggle-3d').prop('checked')){
        $('#loading-3d-plot').html("Loading..");
        Plotly.newPlot("plot-3d-cluster", Object.values(trace_3d), layout_3d);
        if($('#methylation_tsneGrouping option:selected').val() === 'biosample'){
            for(i = 0; i < groups_3d.length; i++){
                Plotly.restyle("plot-3d-cluster", updates_3d[i], groups_3d[i]);
            }
        }
        $('#loading-3d-plot').html("");
        $('#plot-2d-cluster').hide();
        $('#plot-3d-cluster-div').show();
    }
    else {
        Plotly.purge("plot-3d-cluster");
        $('#plot-2d-cluster').show();
        $('#plot-3d-cluster-div').hide();
    }
}

function getMax(arr, prop) {
    var max = 0;
    for (var key in arr) {
        if(parseInt(arr[key][prop]) > max)
            max = arr[key][prop];
    }
    return max;
}

function generateBrowserURL(gene) {
    var base = 'http://brainome.ucsd.edu/annoj_private/CEMBA/index';
    
    if (ensemble === 'Ens1') {
        base += '.html';
    } else { 
        base += '_' + ensemble + '.html';
    }

    var chrom = gene.chr.replace(/^\D+/g, "");

    if (gene.strand === '+') {
        var position = gene.start;
    } else {
        var position = gene.end;
    }
    return base+'?assembly='+chrom+'&position='+position;
}

function initGeneNameSearch() {
    geneNameSelector = $('#geneName').select2({
        placeholder: 'Search..',
        allowClear: true,
        ajax: {
            url: './gene/names/'+ensemble,
            dataType: 'json',
            delay: 500,
            data: function(params) {
                return {
                    q: params.term
                };
            },
            processResults: function(data) {
                geneSearchCache = data;
                return {
                    results: $.map(data, function(gene) {
                        return {
                            text: gene.gene_name,
                            id: gene.gene_id
                        }
                    })
                }
            },
            cache: true
        },
        minimumInputLength: 1
    });

    //Initialise selector
    var defaultGene = storage.load('lastViewedGenes');
    if (!defaultGene || defaultGene.length === 0) {
        //no entry or browser does not support localStorage, set default to GAD2
        defaultGene = [{gene_name: 'GAD2', gene_id: 'ENSMUSG00000026787'}];
    }
    
    if(defaultGene !== []){
        var numGenes = defaultGene.length;
        for (i = 0; i < numGenes; i++) {
            $.ajax({
                url: './gene/id/'+ensemble+'?q='+defaultGene[i].gene_id,
                dataType: 'json',
                async: false,
                success: function(data) {
                    if (typeof(data.gene_name) !== 'undefined' && typeof(data.gene_id) !== 'undefined') {
                        var option = new Option(data.gene_name, data.gene_id, true, true);
                        geneNameSelector.append(option);
                        if (numGenes === 1) {
                            $('#epiBrowserLink').attr('href', generateBrowserURL(data));
                            $('#epiBrowserLink').removeClass('disabled');
                        }
                    }
                }
            });
        }
        updateGeneElements();
    }
}

function initGeneModules() {
     geneModuleSelector = $('#geneModulesSelect').select2({
        placeholder: 'Select..',
        allowClear: true,
        minimumResultsForSearch: Infinity
    });

    $.getJSON({
        url: './gene/modules/'+ensemble,
        success: function(data){
            data.forEach(function(gene) {
                var option = new Option(gene.module, gene.module, false, false);
                geneModuleSelector.append(option);
            });
        }
    });
}

function updateSearchWithModules(module) {
	$.getJSON({
		url: './gene/modules/'+ensemble+'?q='+module.id,
		success: function (data) {
			data.forEach(function(gene) {
				var option = new Option(gene.gene_name, gene.gene_id, true, true);
				geneNameSelector.append(option);
			});
		}
	});
}


// Options for tSNE (methylation) plot //
function populateMethylationTSNEDropdowns() {
    $.ajax({
        url: '/methylation_tsne_options/'+ensemble,
        dataType: 'json',
        async: false,
        success: function(data) {
            window.global_all_methylation_tsne_settings = data['all_tsne_settings'];
            window.global_all_methylation_clustering_settings = data['all_clustering_settings'];
            window.global_all_methylation_clustering_settings2 = data['all_clustering_settings2'];

            $.each(data['tsne_methylation'], function(key, val) {
                $(".methylation-tsne-methylation").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            dynamicMethylationTSNEOptions_methylation();
            /*
            $.each(data["tsne_dimensions"], function(key, val) {
                $(".methylation-tsne-dimensions").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            $.each(data["tsne_perplexity"], function(key, val) {
                $(".methylation-tsne-perplexity").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            */
            $.each(data["clustering_algorithms"], function(key, val) {
                $(".methylation-clustering-algorithms").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            dynamicMethylationClusteringOptions_algorithm();
            /*
            $.each(data["clustering_methylation"], function(key, val) {
                $(".methylation-clustering-methylation").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            $.each(data["clustering_npc"], function(key, val) {
                $(".methylation-clustering-npc").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            $.each(data["clustering_k"], function(key, val) {
                $(".methylation-clustering-k").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            */
        }
    });
}

// Options for tSNE (snATAC) plot //
function populatesnATACTSNEDropdowns() {
    $.ajax({
        url: '/snATAC_tsne_options/'+ensemble,
        dataType: 'json',
        async: false,
        success: function(data) {
            window.global_all_snATAC_tsne_settings = data['all_tsne_settings'];
            window.global_all_snATAC_clustering_settings = data['all_clustering_settings'];
            $.each(data["tsne_dimensions"], function(key, val) {
                $(".snATAC-tsne-dimensions").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            $.each(data["tsne_perplexity"], function(key, val) {
                $(".snATAC-tsne-perplexity").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            $.each(data["clustering_algorithms"], function(key, val) {
                $(".snATAC-clustering-algorithms").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            $.each(data["clustering_npc"], function(key, val) {
                $(".snATAC-clustering-npc").append(
                    $('<option></option>').val(val).text(val)
                );
            });
            $.each(data["clustering_k"], function(key, val) {
                $(".snATAC-clustering-k").append(
                    $('<option></option>').val(val).text(val)
                );
            });
        }
    });
}

function dynamicMethylationTSNEOptions_methylation() {
    var matching_tsne_options = [];
    var regex = new RegExp('^'+$(".methylation-tsne-methylation").val() + "_\\w+");

    for (var i = 0; i < global_all_methylation_tsne_settings.length; i++) {
        if (global_all_methylation_tsne_settings[i].match(regex) !== null) {
            matching_tsne_options.push(global_all_methylation_tsne_settings[i]);
        }
    }

    var dimensions_set = new Set();
    for (var i = 0; i < matching_tsne_options.length; i++) {
        var dimensions = matching_tsne_options[i].split('_')[1];
        dimensions_set.add(dimensions.replace("ndim",""));
    }
    var dimensions_list = [...dimensions_set];

    $(".methylation-tsne-dimensions").empty();
    $(".methylation-tsna-perplexity").empty();
    for (var i = 0; i < dimensions_list.length; i++) {
        $(".methylation-tsne-dimensions").append(
            $("<option></option>").val(dimensions_list[i]).text(dimensions_list[i])
        );
    }

    dynamicMethylationTSNEOptions_dimensions(matching_tsne_options);
}   

function dynamicMethylationTSNEOptions_dimensions(matching_tsne_options = []) {
    if (matching_tsne_options.length === 0) {
        var matching_tsne_options = [];
        var regex = new RegExp('^'+$(".methylation-tsne-methylation").val() + "_ndim" + $(".methylation-tsne-dimensions").val() + "_\\w+");
        for (var i = 0; i < global_all_methylation_tsne_settings.length; i++) {
            if (global_all_methylation_tsne_settings[i].match(regex) !== null) {
                matching_tsne_options.push(global_all_methylation_tsne_settings[i]);
            }
        }
    }

    var perplexity_set = new Set();
    for (var i = 0; i < matching_tsne_options.length; i++) {
        var perplexity = matching_tsne_options[i].split('_')[2];
        perplexity_set.add(perplexity.replace("perp",""));
    }
    var perplexity_list = [...perplexity_set];

    $(".methylation-tsne-perplexity").empty();
    for (var i = 0; i < perplexity_list.length; i++) {
        $(".methylation-tsne-perplexity").append(
            $("<option></option>").val(perplexity_list[i]).text(perplexity_list[i])
        );
    }
}

function dynamicMethylationClusteringOptions_algorithm() {
    var matching_clustering_options = [];
    var regex = new RegExp('_' + $(".methylation-clustering-algorithms").val() + "_\\w+");
    console.log(regex);

    for (var i = 0; i < global_all_methylation_clustering_settings.length; i++) {
        if (global_all_methylation_clustering_settings[i].match(regex) !== null) {
            matching_clustering_options.push(global_all_methylation_clustering_settings[i]);
        }
    }

    var methylation_set = new Set();
    for (var i = 0; i < matching_clustering_options.length; i++) {
        var methylation_type = matching_clustering_options[i].split('_')[0];
        methylation_set.add(methylation_type);
    }
    var methylation_list = [...methylation_set];

    $(".methylation-clustering-methylation").empty();
    for (var i = 0; i < methylation_list.length; i++) {
        $(".methylation-clustering-methylation").append(
            $("<option></option>").val(methylation_list[i]).text(methylation_list[i])
        );
    }

    dynamicMethylationClusteringOptions_methylation(matching_clustering_options);
}

function dynamicMethylationClusteringOptions_methylation(matching_clustering_options = []) {
    if (matching_clustering_options.length === 0) {
        var matching_clustering_options = [];
        var regex = new RegExp('^'+$(".methylation-clustering-methylation").val()+'_'+$(".methylation-clustering-algorithms").val() + "_\\w+");

        for (var i = 0; i < global_all_methylation_clustering_settings.length; i++) {
            if (global_all_methylation_clustering_settings[i].match(regex) !== null) {
                matching_clustering_options.push(global_all_methylation_clustering_settings[i]);
            }
        }
    }

    var npc_set = new Set();
    for (var i = 0; i < matching_clustering_options.length; i++) {
        var npc = matching_clustering_options[i].split('_')[2].replace("npc","");
        npc_set.add(npc);
    }
    var npc_list = [...npc_set];

    $(".methylation-clustering-npc").empty();
    for (var i = 0; i < npc_list.length; i++) {
        $(".methylation-clustering-npc").append(
            $("<option></option>").val(npc_list[i]).text(npc_list[i])
        );
    }

    dynamicMethylationClusteringOptions_npc(matching_clustering_options);
}

function dynamicMethylationClusteringOptions_npc(matching_clustering_options = []) {
    if (matching_clustering_options.length === 0) {
        var matching_clustering_options = [];
        var regex = new RegExp('^'+$(".methylation-clustering-methylation").val()+'_'+$(".methylation-clustering-algorithms").val()+'_npc'+$(".methylation-clustering-npc").val() + "_\\w+");

        for (var i = 0; i < global_all_methylation_clustering_settings.length; i++) {
            if (global_all_methylation_clustering_settings[i].match(regex) !== null) {
                matching_clustering_options.push(global_all_methylation_clustering_settings[i]);
                //matching_clustering_options.push(i);
            }
        }
    }
    console.log(matching_clustering_options);

    k_list = [];
    k_clusters_list = [];
    for (var i = 0; i < matching_clustering_options.length; i++) {
        var k = matching_clustering_options[i].split('_')[3].replace("k","");
        var clusters = global_all_methylation_clustering_settings2[matching_clustering_options[i]];
        k_list.push(k);
        k_clusters_list.push(k+' ('+clusters+' clusters)');
    }

    $(".methylation-clustering-k").empty();
    for (var i = 0; i < k_list.length; i++) {
        $(".methylation-clustering-k").append(
            $("<option></option>").val(k_list[i]).text(k_clusters_list[i])
        );
    }
}

function dynamicsnATACTSNEOptions_dimensions(matching_tsne_options = []) {
    if (matching_tsne_options.length === 0) {
        var matching_tsne_options = [];
        var regex = new RegExp("ATAC_ndim" + $(".snATAC-tsne-dimensions").val() + "_\\w+");
        for (var i = 0; i < global_all_snATAC_tsne_settings.length; i++) {
            if (global_all_snATAC_tsne_settings[i].match(regex) !== null) {
                matching_tsne_options.push(global_all_snATAC_tsne_settings[i]);
            }
        }
    }

    var perplexity_set = new Set();
    for (var i = 0; i < matching_tsne_options.length; i++) {
        var perplexity = matching_tsne_options[i].split('_')[2];
        perplexity_set.add(perplexity.replace("perp",""));
    }
    var perplexity_list = [...perplexity_set];

    $(".snATAC-tsne-perplexity").empty();
    for (var i = 0; i < perplexity_list.length; i++) {
        $(".snATAC-tsne-perplexity").append(
            $("<option></option>").val(perplexity_list[i]).text(perplexity_list[i])
        );
    }
}


function dynamicsnATACClusteringOptions_algorithm(matching_clustering_options = []) {
    if (matching_clustering_options.length === 0) {
        var matching_clustering_options = [];
        var regex = new RegExp('ATAC_'+$(".methylation-clustering-algorithms").val() + "_\\w+");

        for (var i = 0; i < global_all_snATAC_clustering_settings.length; i++) {
            if (global_all_snATAC_clustering_settings[i].match(regex) !== null) {
                matching_clustering_options.push(global_all_snATAC_clustering_settings[i]);
            }
        }
    }

    var npc_set = new Set();
    for (var i = 0; i < matching_clustering_options.length; i++) {
        var npc = matching_clustering_options[i].split('_')[2].replace("npc","");
        npc_set.add(npc);
    }
    var npc_list = [...npc_set];

    $(".snATAC-clustering-npc").empty();
    for (var i = 0; i < npc_list.length; i++) {
        $(".snATAC-clustering-npc").append(
            $("<option></option>").val(npc_list[i]).text(npc_list[i])
        );
    }

    dynamicsnATACClusteringOptions_npc(matching_clustering_options);
}

function dynamicsnATACClusteringOptions_npc(matching_clustering_options = []) {
    if (matching_clustering_options.length === 0) {
        var matching_clustering_options = [];
        var regex = new RegExp('ATAC_'+$(".snATAC-clustering-algorithms").val()+'_npc'+$(".snATAC-clustering-npc").val() + "_\\w+");

        for (var i = 0; i < global_all_snATAC_clustering_settings.length; i++) {
            if (global_all_snATAC_clustering_settings[i].match(regex) !== null) {
                matching_clustering_options.push(global_all_snATAC_clustering_settings[i]);
            }
        }
    }

    var k_set = new Set();
    for (var i = 0; i < matching_clustering_options.length; i++) {
        var k = matching_clustering_options[i].split('_')[3].replace("k","");
        k_set.add(k);
    }
    var k_list = [...k_set];

    $(".snATAC-clustering-k").empty();
    for (var i = 0; i < k_list.length; i++) {
        $(".snATAC-clustering-k").append(
            $("<option></option>").val(k_list[i]).text(k_list[i])
        );
    }
}

function updateGeneElements(updateMCHScatter=true) {
    buttons = document.getElementsByClassName('modebar-btn');
    var geneSelected = $('#geneName option:selected').val();
    if (geneSelected != 'Select..' && $("#geneName").select2('data').length > 0) {
        $('#orthologsToggle').bootstrapToggle('off');
        $('#orthologsToggle').bootstrapToggle('enable');

        var lastViewedGenes = [];
        for(i=0; i<$('#geneName').select2('data').length; i++){
            lastViewedGenes.push({gene_name: $('#geneName option:selected')[i].text, gene_id: $('#geneName option:selected')[i].value});
        }
        if (typeof(Storage) !== 'undefined') {
            storage.save('lastViewedGenes', lastViewedGenes, 5);  // store last viewed genes for 5 minutes
        }
        if (updateMCHScatter){
            updateMCHScatterPlot();
            if (snATAC_data_available === 1) {
                updatesnATACScatterPlot();
            }
        }
        if($("#geneName").select2('data').length > 1) {
            $('#normalize-heatmap').show();
            $('#methylation-box-heat-normalize-toggle').prop('disabled', false);
            updateMethylationHeatmap();
            updateDataTable("Select..");
            $('#epiBrowserLink').addClass('disabled');

            if (snATAC_data_available === 1) {
                updatesnATACHeatmap();
                $('#snATAC-box-heat-normalize-toggle').prop('disabled', false);
            }
        }
        else{
            $('#epiBrowserLink').removeClass('disabled');
            $('#normalize-heatmap').hide();
            $('#methylation-box-heat-normalize-toggle').prop('disabled', true);
            //updateOrthologToggle();
            updateMCHBoxPlot();
            updateDataTable($('#geneName option:selected').val());
            if (snATAC_data_available === 1) {
                updatesnATACBoxPlot();
                $('#snATAC-box-heat-normalize-toggle').prop('disabled', true);
            }

            $.ajax({
                url: './gene/id/'+ensemble+'?q='+geneSelected,
                dataType: 'json',
                success: function(data) {
                    if (typeof(data.gene_name) !== 'undefined' && typeof(data.gene_id) !== 'undefined') {
                        $('#epiBrowserLink').attr('href', generateBrowserURL(data));
                        $('#epiBrowserLink').removeClass('disabled');
                    }
                }
            });
        }
    }
}

/*
function loadClusterPlots() {
    var grouping = $('.methylation-tsne-grouping').val();
    var clustering = $('.methylation-tsne-clustering').val();
    var tsne_setting = $('.methylation-tsne-settings').val();

    $.ajax({
        type: "GET",
        url: './plot/tsne/'+ensemble+'/'+tsne_setting+'/'+grouping+'/'+clustering, 
        success: function(data) {
            num_colors = getMax(data["traces"], "legendgroup");
            Plotly.newPlot("plot-2d-cluster", Object.values(data["traces"]), data["layout"], {showLink: false});
            $('#loading_2dtsne').html("");
        }
    });
}
*/

function updateMCHScatterPlot() {
    var levelType = $('input[name=levels]').filter(':checked').val();
    var methylationType = $('input[name=mType]').filter(':checked').val();
    var methylation_color_percentile_Values = methylation_color_percentile_Slider.getValue();
    var genes = $("#geneName").select2('data');
    var grouping = $('#methylation-tsne-grouping').val();
    var genes_query = "";

    var tsne_setting = $("#methylation-tsne-methylation").val() + "_ndim" + $("#methylation-tsne-dimensions").val() + "_perp" + $("#methylation-tsne-perplexity").val();
    var clustering = $("#methylation-clustering-methylation").val()+"_"+$("#methylation-clustering-algorithms").val()+"_npc"+$("#methylation-clustering-npc").val()+"_k"+$("#methylation-clustering-k").val();

    if ($('#methylation_tsneOutlierToggle').prop('checked')) {
        var tsneOutlierOption = 'false';
    } else {
        var tsneOutlierOption = 'true';
    }

    for (i = 0; i < genes.length; i++) {
        genes_query += (genes[i].id + "+");
    }
    genes_query = genes_query.slice(0,-1);
    if ($('#geneName option:selected').val() != 'Select..') {
        $.ajax({
        //$.getJSON({
            type: "GET",
            url: './plot/methylation/scatter/'+ensemble+'/'+tsne_setting+'/' +methylationType+ '/'+levelType+'/'+grouping+'/'+clustering+'/'+methylation_color_percentile_Values[0]+'/'+methylation_color_percentile_Values[1]+'/'+tsneOutlierOption+'?q='+genes_query,
            success: function(data) {
                $('#plot-mch-scatter').html("");
                //Plotly.newPlot('plot-mch-scatter', data);
                $('#plot-mch-scatter').html(data);
            }
        });
    }

    $("#methylation-tsne-heading-num-dimensions").text($("#methylation-tsne-dimensions").val() + "D ");
    $("#methylation-tsne-options-heading").text("Methylation: " + $("#methylation-tsne-methylation").val() + ", Perplexity: " + $("#methylation-tsne-perplexity").val());

    $("#methylation-clustering-options-heading").text("Algorithm: " + $("#methylation-clustering-algorithms").val() + ", Methylation: " + $("#methylation-clustering-methylation").val() + ", # of PCs: " + $("#methylation-clustering-npc").val() + ", K-value: " + $("#methylation-clustering-k").val());
}

function updatesnATACScatterPlot() {
    var tsne_settings = "ATAC_ndim"+$("#snATAC-tsne-dimensions").val()+"_perp"+$("#snATAC-tsne-perplexity").val();
    var grouping = $("#snATAC-tsne-grouping").val();
    //var grouping = "cluster";
    var clustering_settings = "ATAC_"+$("#snATAC-clustering-algorithms").val()+"_npc"+$("#snATAC-clustering-npc").val()+"_k"+$("#snATAC-clustering-k").val();
    var snATAC_color_percentile_Values = snATAC_color_percentile_Slider.getValue();
    var genes = $("#geneName").select2('data');
    var genes_query = "";

    if ($('#snATAC_tsneOutlierToggle').prop('checked')) {
        var tsneOutlierOption = 'false';
    } else {
        var tsneOutlierOption = 'true';
    }

    for (i = 0; i < genes.length; i++) {
        genes_query += (genes[i].id + "+");
    }
    genes_query = genes_query.slice(0,-1);
    if ($('#geneName option:selected').val() != 'Select..') {
        $.ajax({
        //$.getJSON({
            type: "GET",
            url: './plot/snATAC/scatter/'+ensemble+'/'+grouping+'/'+snATAC_color_percentile_Values[0]+'/'+snATAC_color_percentile_Values[1]+'/'+tsneOutlierOption+'?q='+genes_query,
            success: function(data) {
                $('#plot-snATAC-scatter').html("");
                //Plotly.newPlot('plot-mch-scatter', data);
                $('#plot-snATAC-scatter').html(data);
            }
        });
    }

    $("#snATAC-tsne-heading-num-dimensions").text($("#snATAC-tsne-dimensions").val() + "D ");
    $("#snATAC-tsne-options-heading").text("Perplexity: " + $("#snATAC-tsne-perplexity").val());

    $("#snATAC-clustering-options-heading").text("Algorithm: " + $("#snATAC-clustering-algorithms").val() + ", # of PCs: " + $("#snATAC-clustering-npc").val() + ", K-value: " + $("#snATAC-clustering-k").val());
}

/*
function updateOrthologToggle() {
    var geneSelected = $('#geneName option:selected').val();
    $.ajax({
        type: "GET",
        url: './gene/orthologs/'+ensemble+'/'+geneSelected,
        success: function(data) {
            if (data.mmu_gID === "" || data.hsa_gID === "") {
                $('#orthologsToggle').bootstrapToggle('off');
                $('#orthologsToggle').bootstrapToggle('disable');
            } else {
                mmu_gID = data.mmu_gID;
                hsa_gID = data.hsa_gID;
                $('#orthologsToggle').bootstrapToggle('enable');
                if ($('#orthologsToggle').prop('checked')) {
                    return updateMCHCombinedBoxPlot(mmu_gID, hsa_gID);
                }
            }
        }
    });
}
*/

function initDataTableClick() {
    $('#geneTable tbody').on('click', 'tr', function () {
        var id = $(this).attr('id');
        $.getJSON({
            url: './gene/id/'+ensemble+'?q='+id,
            success: function (data) {
                var option = new Option(data.gene_name, data.gene_id, true, true);
                var i;
                for(i=0; i < $("#geneName").select2('data').length; i++){
                    if($("#geneName").select2('data')[i].id === option.value){
                        return;
                    }
                }
                geneNameSelector.append(option);
                $('#epiBrowserLink').attr('href', generateBrowserURL(data));
                $('#epiBrowserLink').removeClass('disabled');
                updateGeneElements();
            }
        });
    });
}

function updateDataTable(geneSelected) {
    if (geneSelected !== 'Select..' || geneSelected !== "") {
        table = $('#geneTable').DataTable( {
            "destroy": true,
            "ordering": false,
            "lengthChange": false,
            "dom": "<'col-sm-12'<f>>" +
                    "<<t>>" +
                    "<'col-sm-12'<i>>" +
                    "<'col-sm-12'<p>>",
            "pagingType": "simple",
            "ajax": {
                "url": "./gene/corr/"+ensemble+"/"+geneSelected,
                "dataSrc": ""
            },
            "rowId": 'gene_id',
            "columns": [
                { "data": "Rank" },
                { "data": "gene_name" },
                { "data": "Corr" },
            ],
        });
    }
    else {
        table.clear();
    }
}

function updateMCHBoxPlot() {
    var levelType = $('input[name=levels]').filter(':checked').val();
    var methylationType = $('input[name=mType]').filter(':checked').val();
    var geneSelected = $('#geneName option:selected').val();
    var grouping = $('#methylation-box-heat-grouping').val();
    var clustering = $("#methylation-clustering-box-heat-methylation").val()+"_"+$("#methylation-clustering-box-heat-algorithms").val()+"_npc"+$("#methylation-clustering-box-heat-npc").val()+"_k"+$("#methylation-clustering-box-heat-k").val();
    if ($('#orthologsToggle').prop('checked')) {
        return updateMCHCombinedBoxPlot(mmu_gID, hsa_gID);
    }
    if ($('#methylation-box-heat-outlierToggle').prop('checked')) {
        var outlierOption = 'outliers';
    } else {
        var outlierOption = 'false';
    }

    $.ajax({
        type: "GET",
        url: './plot/methylation/box/'+ensemble+'/'+methylationType+'/'+geneSelected+'/'+grouping+'/'+clustering+'/'+levelType+'/'+outlierOption,
        success: function(data) {
            $('#plot-mch-heat').html("");
            $('#mch_box_div').addClass("col-md-9");
            $('#gene_table_div').show();
            $('#plot-mch-box').html(data);
        }
    });

}

function updatesnATACBoxPlot() {
    var geneSelected = $('#geneName option:selected').val();
    var grouping = $('#snATAC-box-heat-grouping').val();

    if ($('#snATAC-box-heat-outlierToggle').prop('checked')) {
        var outlierOption = 'outliers';
    } else {
        var outlierOption = 'false';
    }

    $.ajax({
        type: "GET",
        url: './plot/snATAC/box/'+ensemble+'/'+geneSelected+'/'+grouping+'/'+outlierOption,
        success: function(data) {
            $('#plot-snATAC-heat').html("");
            $('#plot-snATAC-box').html(data);
        }
    });

}

function updateMCHCombinedBoxPlot(mmu_gid, hsa_gid) {
    var levelType = $('input[name=levels]').filter(':checked').val();
    var methylationType = $('input[name=mType]').filter(':checked').val();
    if ($('#methylation-box-heat-outlierToggle').prop('checked')) {
        var outlierOption = 'outliers';
    } else {
        var outlierOption = 'false';
    }

    $.ajax({
        type: "GET",
        url: './plot/box_combined/'+methylationType+'/'+mmu_gid+'/'+hsa_gid+'/'+levelType+'/'+outlierOption,
        success: function(data) {
            $('#plot-mch-heat').html("");
            $('#mch_box_div').addClass("col-md-9");
            $('#gene_table_div').show();
            $('#plot-mch-box').html(data);
        }
    });

}

function updateMethylationHeatmap() {
    var levelType = $('input[name=levels]').filter(':checked').val();
    var methylationType = $('input[name=mType]').filter(':checked').val();
    var methylation_color_percentile_Values = methylation_color_percentile_Slider.getValue();
    var genes = $("#geneName").select2('data');
    var genes_query = "";
    var grouping = $("#methylation-box-heat-grouping").val();
    var clustering = $("#methylation-clustering-box-heat-methylation").val()+"_"+$("#methylation-clustering-box-heat-algorithms").val()+"_npc"+$("#methylation-clustering-box-heat-npc").val()+"_k"+$("#methylation-clustering-box-heat-k").val();

    for (i = 0; i < genes.length; i++) {
        genes_query += (genes[i].id + "+");
    }
    if ($('#methylation-box-heat-normalize-toggle').prop('checked')) {
        var normalize = 'true';
    }
    else {
        var normalize = 'false';
    }
    genes_query = genes_query.slice(0,-1);

    $.ajax({
        type: "GET",
        url: './plot/methylation/heat/'+ensemble+'/'+methylationType+'/'+grouping+'/'+clustering+'/'+levelType+'/'+methylation_color_percentile_Values[0]+'/'+methylation_color_percentile_Values[1]+'?q='+genes_query+'&normalize='+normalize,
        success: function(data) {
            $('#plot-mch-box').html("");
            $('#gene_table_div').hide();
            $('#mch_box_div').removeClass("col-md-9");
            $('#plot-mch-heat').html(data);
            $('#methylation-box-heat-outlierToggle').bootstrapToggle('disable');
        }
    });
}

function updatesnATACHeatmap() {
    var levelType = $('input[name=levels]').filter(':checked').val();
    var snATAC_color_percentile_Values = snATAC_color_percentile_Slider.getValue();
    var genes = $("#geneName").select2('data');
    var genes_query = "";
    var grouping = $("#snATAC-box-heat-grouping").val();

    for (i = 0; i < genes.length; i++) {
        genes_query += (genes[i].id + "+");
    }
    if ($('#snATAC-box-heat-normalize-toggle').prop('checked')) {
        var normalize = 'true';
    }
    else {
        var normalize = 'false';
    }
    genes_query = genes_query.slice(0,-1);

    $.ajax({
        type: "GET",
        url: './plot/snATAC/heat/'+ensemble+'/'+grouping+'/'+snATAC_color_percentile_Values[0]+'/'+snATAC_color_percentile_Values[1]+'?q='+genes_query+'&normalize='+normalize,
        success: function(data) {
            $('#plot-snATAC-box').html("");
            $('#plot-snATAC-heat').html(data);
            $('#snATAC-box-heat-outlierToggle').bootstrapToggle('disable');
        }
    });
}

function updateMethylationHeatmapTwoSpecies() {
    var levelType = $('input[name=levels]').filter(':checked').val();
    var methylationType = $('input[name=mType]').filter(':checked').val();
    var methylation_color_percentile_Values = methylation_color_percentile_Slider.getValue();
    var genes = $("#geneName").select2('data');
    var genes_query = "";
    
    for (i = 0; i < genes.length; i++) {
        genes_query += (genes[i].id + "+");
    }
    if ($('#methylation-box-heat-normalize-toggle').prop('checked')) {
        var normalize = 'true';
    }
    else {
        var normalize = 'false';
    }
    genes_query = genes_query.slice(0,-1);

    $.ajax({
        type: "GET",
        url: './plot/heat_two_ensemble/'+ensemble+'/'+methylationType+'/'+levelType+'/'+methylation_color_percentile_Values[0]+'/'+methylation_color_percentile_Values[1]+'?q='+genes_query+'&normalize='+normalize,
        success: function(data) {
            $('#plot-mch-box').html("");
            $('#gene_table_div').hide();
            $('#mch_box_div').removeClass("col-md-9");
            $('#plot-mch-heat').html(data);
            $('#methylation-box-heat-outlierToggle').bootstrapToggle('disable');
        }
    });
}
